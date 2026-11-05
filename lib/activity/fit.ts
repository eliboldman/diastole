// Turns a FIT activity file (Garmin watch original) into compact data for the activity view:
// a session summary, streams resampled to a few seconds, laps, and a privacy-trimmed route.
// Pure: no server or database imports, so it can run in tests and in the browser import.
import { Decoder, Stream } from "@garmin/fitsdk";

export type StreamKey =
  | "hr" // bpm
  | "speed" // m/s
  | "power" // W
  | "cadence" // steps/min for foot sports, rpm otherwise
  | "alt" // m
  | "dist" // m, cumulative
  | "vo" // vertical oscillation, mm
  | "gct" // ground contact time, ms
  | "gct_bal" // ground contact balance, % left
  | "stride" // stride length, m
  | "vr"; // vertical ratio, %

export type Streams = {
  interval_s: number;
  t: number[];
  pool?: { unit: "METER" | "YARD"; length_m: number }; // pool swims only, as the watch recorded it
} & Partial<Record<StreamKey, (number | null)[]>>;

export type Lap = {
  start_s: number; // offset from activity start
  duration_s: number | null; // timer time
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_speed: number | null;
  max_speed: number | null;
  avg_power: number | null;
  avg_cadence: number | null;
  ascent_m: number | null;
  intensity: string | null; // active, rest, warmup, cooldown, recovery, interval
  step_index: number | null; // structured workout step this lap belongs to
  // Pool swims (absent on laps parsed before these were kept)
  lengths?: number | null; // active lengths
  strokes?: number | null;
  stroke?: string | null; // freestyle, backstroke, breaststroke, butterfly, drill, mixed
};

export type FitSummary = {
  sport: string | null;
  sub_sport: string | null;
  start_time: string;
  duration_s: number | null; // moving/timer time
  elapsed_s: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  avg_power: number | null;
  max_power: number | null;
  normalized_power: number | null;
  avg_cadence: number | null;
  training_load: number | null;
  device: string | null;
};

export type StrengthSetRow = { category: string | null; reps: number | null; weight: number | null; duration_s: number | null };

export type FitActivity = {
  summary: FitSummary;
  sets: StrengthSetRow[]; // logged strength sets (active ones only)
  streams: Streams;
  laps: Lap[];
  route: [number, number][] | null;
  record_fields: string[]; // every record field present, for checking what a device records
};

/** Route points this close to the start or finish are dropped, so home addresses never show. */
export const ROUTE_TRIM_M = 200;
const MAX_ROUTE_POINTS = 600;
const MAX_STREAM_POINTS = 2400;

const FOOT_SPORTS = /running|walking|hiking|trail|treadmill/i;
const SEMI_TO_DEG = 180 / 2 ** 31;

type Rec = Record<string, unknown>;
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pos = (v: unknown) => {
  const x = n(v);
  return x !== null && x > 0 ? x : null;
};
const round = (v: number | null, digits = 0) => (v === null ? null : Number(v.toFixed(digits)));
const snake = (s: unknown) => (typeof s === "string" ? s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase() : null);
const time = (v: unknown) => (v instanceof Date ? v.getTime() : null);

/** Running cadence in FIT is strides per minute (one foot); people talk in steps per minute. */
function cadenceOf(r: Rec, foot: boolean, field = "cadence", fractional = "fractionalCadence") {
  const c = n(r[field]);
  if (c === null || c <= 0) return null;
  return foot ? (c + (n(r[fractional]) ?? 0)) * 2 : c;
}

export function haversine(a: [number, number], b: [number, number]) {
  const R = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toRad;
  const dLon = (b[1] - a[1]) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Drops points near the start and finish, then thins to a drawable size. Null when little is left. */
export function trimRoute(points: [number, number][], trimM = ROUTE_TRIM_M): [number, number][] | null {
  if (points.length < 2) return null;
  const start = points[0];
  const end = points[points.length - 1];
  const kept = points.filter((p) => haversine(p, start) > trimM && haversine(p, end) > trimM);
  if (kept.length < 10) return null;
  const step = Math.ceil(kept.length / MAX_ROUTE_POINTS);
  return kept.filter((_, i) => i % step === 0).map(([la, lo]) => [round(la, 5)!, round(lo, 5)!]);
}

export function parseFit(bytes: Uint8Array): FitActivity {
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  if (!decoder.isFIT()) throw new Error("Not a FIT file");
  const { messages, errors } = decoder.read({ mergeHeartRates: true });
  const sessions = (messages.sessionMesgs ?? []) as Rec[];
  const records = ((messages.recordMesgs ?? []) as Rec[]).filter((r) => time(r.timestamp) !== null);
  if (!sessions.length && !records.length) throw new Error(errors.length ? `FIT decode failed: ${errors[0]}` : "FIT file has no activity");
  records.sort((a, b) => time(a.timestamp)! - time(b.timestamp)!);

  const s = sessions[0] ?? {};
  const sport = snake(s.sport);
  const swim = /swim/i.test(sport ?? "");
  const foot = FOOT_SPORTS.test(`${sport ?? ""} ${snake(s.subSport) ?? ""}`);
  const startMs = time(s.startTime) ?? time(records[0]?.timestamp) ?? Date.now();
  const sum = (key: string) => {
    const vals = sessions.map((x) => n(x[key])).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const deviceInfo = ((messages.deviceInfoMesgs ?? []) as Rec[]).find((d) => d.deviceIndex === "creator" || d.deviceIndex === 0);
  const fileId = ((messages.fileIdMesgs ?? []) as Rec[])[0];
  const device = snake(deviceInfo?.garminProduct ?? fileId?.garminProduct ?? null);

  const summary: FitSummary = {
    sport,
    sub_sport: snake(s.subSport),
    start_time: new Date(startMs).toISOString(),
    duration_s: round(sum("totalTimerTime")),
    elapsed_s: round(sum("totalElapsedTime")),
    distance_m: round(pos(sum("totalDistance")), 1),
    avg_hr: pos(s.avgHeartRate),
    max_hr: pos(s.maxHeartRate),
    calories: pos(sum("totalCalories")),
    elevation_gain_m: n(sum("totalAscent")),
    elevation_loss_m: n(sum("totalDescent")),
    avg_speed_mps: round(pos(s.enhancedAvgSpeed ?? s.avgSpeed), 3),
    max_speed_mps: round(pos(s.enhancedMaxSpeed ?? s.maxSpeed), 3),
    avg_power: pos(s.avgPower),
    max_power: pos(s.maxPower),
    normalized_power: pos(s.normalizedPower),
    avg_cadence: round(cadenceOf(s, foot, "avgCadence", "avgFractionalCadence") ?? cadenceOf(s, foot, "avgRunningCadence", "_"), 0),
    training_load: round(pos(s.trainingLoadPeak), 1),
    device,
  };

  // Streams: average each field into fixed time buckets.
  const lastMs = time(records[records.length - 1]?.timestamp) ?? startMs;
  const spanS = Math.max(1, (lastMs - startMs) / 1000);
  const interval = Math.max(5, Math.ceil(spanS / MAX_STREAM_POINTS));
  const pick: Record<StreamKey, (r: Rec) => number | null> = {
    hr: (r) => pos(r.heartRate),
    speed: (r) => n(r.enhancedSpeed ?? r.speed),
    power: (r) => n(r.power),
    cadence: (r) => cadenceOf(r, foot),
    alt: (r) => n(r.enhancedAltitude ?? r.altitude),
    dist: (r) => n(r.distance),
    vo: (r) => pos(r.verticalOscillation),
    gct: (r) => pos(r.stanceTime),
    gct_bal: (r) => pos(r.stanceTimeBalance),
    stride: (r) => {
      const mm = pos(r.stepLength);
      return mm === null ? null : mm / 1000;
    },
    vr: (r) => pos(r.verticalRatio),
  };
  const DIGITS: Record<StreamKey, number> = { hr: 0, speed: 3, power: 0, cadence: 0, alt: 1, dist: 1, vo: 1, gct: 0, gct_bal: 1, stride: 2, vr: 1 };

  const buckets = new Map<number, { sums: Partial<Record<StreamKey, [number, number]>> }>();
  const fields = new Set<string>();
  const gps: [number, number][] = [];
  for (const r of records) {
    for (const k of Object.keys(r)) if (r[k] !== undefined && r[k] !== null) fields.add(k);
    const idx = Math.max(0, Math.floor((time(r.timestamp)! - startMs) / 1000 / interval));
    let b = buckets.get(idx);
    if (!b) buckets.set(idx, (b = { sums: {} }));
    for (const key of Object.keys(pick) as StreamKey[]) {
      const v = pick[key](r);
      if (v === null) continue;
      const acc = (b.sums[key] ??= [0, 0]);
      if (key === "dist") {
        acc[0] = Math.max(acc[0], v); // cumulative: keep the bucket's furthest point
        acc[1] = 1;
      } else {
        acc[0] += v;
        acc[1] += 1;
      }
    }
    const lat = n(r.positionLat);
    const lon = n(r.positionLong);
    if (lat !== null && lon !== null && !(lat === 0 && lon === 0)) gps.push([lat * SEMI_TO_DEG, lon * SEMI_TO_DEG]);
  }

  const order = [...buckets.keys()].sort((a, b) => a - b);
  const streams: Streams = { interval_s: interval, t: order.map((i) => i * interval) };
  for (const key of Object.keys(pick) as StreamKey[]) {
    const series = order.map((i) => {
      const acc = buckets.get(i)!.sums[key];
      return acc ? round(acc[0] / acc[1], DIGITS[key]) : null;
    });
    // A stream that never has a real value is left out; all-zero power/cadence means no sensor.
    const real = series.some((v) => v !== null && (key === "alt" || key === "speed" || key === "dist" || v !== 0));
    if (real) streams[key] = series;
  }

  const laps: Lap[] = ((messages.lapMesgs ?? []) as Rec[]).map((l) => ({
    start_s: Math.max(0, Math.round(((time(l.startTime) ?? startMs) - startMs) / 1000)),
    duration_s: round(n(l.totalTimerTime), 1),
    distance_m: round(pos(l.totalDistance), 1),
    avg_hr: pos(l.avgHeartRate),
    max_hr: pos(l.maxHeartRate),
    avg_speed: round(pos(l.enhancedAvgSpeed ?? l.avgSpeed), 3),
    max_speed: round(pos(l.enhancedMaxSpeed ?? l.maxSpeed), 3),
    avg_power: pos(l.avgPower),
    avg_cadence: round(cadenceOf(l, foot, "avgCadence", "avgFractionalCadence"), 0),
    ascent_m: n(l.totalAscent),
    intensity: typeof l.intensity === "string" ? l.intensity : null,
    step_index: n(l.wktStepIndex),
    ...(swim
      ? {
          lengths: pos(l.numActiveLengths),
          strokes: pos(l.totalStrokes ?? l.totalCycles),
          stroke: (pos(l.totalDistance) && snake(l.swimStroke)) || null,
        }
      : {}),
  }));

  const poolLen = pos(s.poolLength);
  if (swim && poolLen) streams.pool = { unit: s.poolLengthUnit === "statute" ? "YARD" : "METER", length_m: round(poolLen, 2)! };

  // Strength sets: the watch lists candidate categories; the first real one wins.
  const sets: StrengthSetRow[] = ((messages.setMesgs ?? []) as Rec[])
    .filter((x) => x.setType !== "rest")
    .map((x) => {
      const cats = (Array.isArray(x.category) ? x.category : [x.category]).map((c) => snake(c)).filter((c) => c && c !== "unknown");
      return { category: cats[0] ?? null, reps: pos(x.repetitions), weight: pos(x.weight), duration_s: round(pos(x.duration), 1) };
    });

  return { summary, streams, laps, sets, route: trimRoute(gps), record_fields: [...fields].sort() };
}

const STOP = new Error("stop");

/**
 * Cheap look at a FIT file: its type, and for activities the start time. Non-activity files
 * (all-day monitoring, settings) stop decoding after the first message, so scanning thousands
 * of export files stays fast.
 */
export function fitFileInfo(bytes: Uint8Array): { type: string | null; start: string | null } {
  let type: string | null = null;
  try {
    const decoder = new Decoder(Stream.fromByteArray(bytes));
    if (!decoder.isFIT()) return { type: null, start: null };
    decoder.read({
      mesgListener: (num, mesg) => {
        if (num === 0) {
          // file_id
          const t = (mesg as unknown as Rec).type;
          type = typeof t === "string" ? t : String(t ?? "");
          throw STOP;
        }
      },
    });
  } catch (e) {
    if (e !== STOP) return { type: null, start: null };
  }
  if (type !== "activity") return { type, start: null };
  try {
    const { messages } = new Decoder(Stream.fromByteArray(bytes)).read({ mergeHeartRates: false });
    const s = ((messages.sessionMesgs ?? []) as Rec[])[0];
    const ms = time(s?.startTime) ?? time(((messages.recordMesgs ?? []) as Rec[])[0]?.timestamp);
    return { type, start: ms === null ? null : new Date(ms).toISOString() };
  } catch {
    return { type, start: null };
  }
}

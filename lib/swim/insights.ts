// Swim stroke insights from the watch's pool laps: distance per stroke, strokes per 25 m, stroke
// rate and SWOLF (normalized to 25 m so pools compare), fade within a swim, trends across swims,
// and rule-based drill suggestions for the coach to approve. Rules, not AI. Pure, for tests.
//
// Stroke counts follow the watch: Garmin counts one stroke per cycle of the watch arm, so distance
// per stroke reads about twice a per-arm count. Thresholds below use that convention.

import type { SwimSummary } from "../activity/swim.ts";

export type SwimMetrics = {
  date: string;
  activity_id: string;
  meters: number; // freestyle meters with stroke data
  pace100: number; // s per 100 m
  spl25: number; // strokes per 25 m
  dps: number; // m per stroke
  rate: number | null; // strokes per minute
  swolf25: number; // time per 25 m + strokes per 25 m
};
export type Fade = { pace100: number; spl25: number; dpsPct: number; rate: number | null; flagged: boolean; text: string };

const FREE = (s: string | null) => !s || s === "freestyle";
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const YD = 0.9144;
/** Words for one unit system: metrics stay per metre / per 25 m; mile users read them per yard. */
const unitText = (yd: boolean) => ({ len: yd ? "25 yd" : "25 m", hundred: yd ? "100 yd" : "100 m", per25: (v: number) => (yd ? v * YD : v), dps: (v: number) => (yd ? `${r2(v / YD)} yd` : `${r2(v)} m`), pace: (v: number) => (yd ? v * YD : v) });

type Rep = SwimSummary["reps"][number];
const usable = (sum: SwimSummary) => sum.reps.filter((r) => FREE(r.stroke) && r.strokes_per_length && r.lengths && r.distance_m >= 20);
const strokesOf = (r: Rep) => (r.strokes_per_length ?? 0) * (r.lengths ?? 0);

function agg(reps: Rep[]) {
  const m = reps.reduce((a, r) => a + r.distance_m, 0);
  const t = reps.reduce((a, r) => a + r.time_s, 0);
  const strokes = reps.reduce((a, r) => a + strokesOf(r), 0);
  const rated = reps.filter((r) => r.stroke_rate);
  const rt = rated.reduce((a, r) => a + r.time_s, 0);
  return { m, t, strokes, rate: rt ? rated.reduce((a, r) => a + r.stroke_rate! * r.time_s, 0) / rt : null };
}

/** One swim's freestyle efficiency. Null without at least 100 m of freestyle with stroke counts. */
export function swimMetrics(sum: SwimSummary, meta: { date: string; activity_id: string }): SwimMetrics | null {
  const a = agg(usable(sum));
  if (a.m < 100 || !a.strokes || !a.t) return null;
  const spl25 = (a.strokes / a.m) * 25;
  const sec25 = (a.t / a.m) * 25;
  return { date: meta.date, activity_id: meta.activity_id, meters: Math.round(a.m), pace100: r1((a.t / a.m) * 100), spl25: r1(spl25), dps: r2(a.m / a.strokes), rate: a.rate ? Math.round(a.rate) : null, swolf25: Math.round(sec25 + spl25) };
}

/**
 * Second half vs first half of the swim's freestyle (by distance). Flagged when stroke count
 * climbs 1+ per 25 m or distance per stroke drops 6%+: form slipping with fatigue.
 */
export function fadeOf(sum: SwimSummary, yd = false): Fade | null {
  const u = unitText(yd);
  const reps = usable(sum);
  const total = reps.reduce((a, r) => a + r.distance_m, 0);
  if (reps.length < 4 || total < 400) return null;
  const first: Rep[] = [];
  const second: Rep[] = [];
  let run = 0;
  for (const r of reps) {
    (run + r.distance_m / 2 <= total / 2 ? first : second).push(r);
    run += r.distance_m;
  }
  if (!first.length || !second.length) return null;
  const a = agg(first);
  const b = agg(second);
  const pace = (b.t / b.m - a.t / a.m) * 100;
  const spl = ((b.strokes / b.m - a.strokes / a.m) * 25);
  const dpsA = a.m / a.strokes;
  const dpsB = b.m / b.strokes;
  const dpsPct = ((dpsB - dpsA) / dpsA) * 100;
  const rate = a.rate && b.rate ? b.rate - a.rate : null;
  const flagged = spl >= 1 || dpsPct <= -6;
  const text = flagged
    ? `Stroke count crept up ${r1(Math.max(u.per25(spl), 0))} per ${u.len} in the second half${pace > 1 ? ` and pace slowed ${Math.round(u.pace(pace))} s/${u.hundred}` : ""}: form slipping as you tire.`
    : pace > 3
      ? `Pace slowed ${Math.round(u.pace(pace))} s/${u.hundred} late but your stroke held: that's fitness, not form.`
      : "Stroke held steady start to finish.";
  return { pace100: r1(pace), spl25: r1(spl), dpsPct: r1(dpsPct), rate: rate === null ? null : Math.round(rate), flagged, text };
}

export type Trend = { from: number; to: number; pct: number };
/** First third vs last third of the swims (oldest first). Needs 4+ swims. */
export function trendOf(ms: SwimMetrics[], key: "dps" | "swolf25" | "pace100" | "spl25"): Trend | null {
  if (ms.length < 4) return null;
  const k = Math.max(1, Math.floor(ms.length / 3));
  const avg = (xs: SwimMetrics[]) => xs.reduce((a, m) => a + m[key], 0) / xs.length;
  const from = avg(ms.slice(0, k));
  const to = avg(ms.slice(-k));
  return { from: r2(from), to: r2(to), pct: r1(((to - from) / from) * 100) };
}

export type DrillKey = "catch_up" | "fingertip" | "count_down" | "tempo_up" | "six_kick" | "hold_form" | "last_25";
export const DRILLS: Record<DrillKey, { name: string; set: string }> = {
  catch_up: { name: "Catch-up freestyle", set: "4 × 50 in the warm-up, 15 s rest. One hand waits out front until the other arrives." },
  fingertip: { name: "Fingertip drag", set: "4 × 25 easy, 10 s rest. Drag fingertips along the surface on the recovery, elbow high." },
  count_down: { name: "Stroke-count 50s", set: "6 × 50, 20 s rest. Count strokes; take 1 fewer per length each 50 at the same effort." },
  tempo_up: { name: "Tempo build", set: "6 × 50, 20 s rest, adding 2 strokes per minute each one (a tempo trainer helps) while keeping your count." },
  six_kick: { name: "6-1-6 switch", set: "4 × 50, 20 s rest. Six kicks on your side, one stroke, six kicks on the other side." },
  hold_form: { name: "Broken 200s, holding count", set: "3 × 200 as 4 × 50 on 10 s rest. Hold your first 50's stroke count on every 50." },
  last_25: { name: "Last-25 focus", set: "In main sets, count strokes on the last 25 of each 100 and match the first 25." },
};
export type Suggestion = { key: DrillKey; why: string };

/** Drill suggestions from recent swims (newest last). The coach approves before the athlete sees any. */
export function suggestDrills(ms: SwimMetrics[], fades: (Fade | null)[], yd = false): Suggestion[] {
  const u = unitText(yd);
  const out: Suggestion[] = [];
  const add = (key: DrillKey, why: string) => {
    if (!out.some((s) => s.key === key)) out.push({ key, why });
  };
  const recent = ms.slice(-5);
  if (recent.length < 2) return out;
  const avg = (k: "dps" | "spl25") => recent.reduce((a, m) => a + m[k], 0) / recent.length;
  const rated = recent.filter((m) => m.rate);
  const rate = rated.length ? rated.reduce((a, m) => a + m.rate!, 0) / rated.length : null;
  const dps = avg("dps");
  const spl = avg("spl25");
  const faded = fades.slice(-5).filter((f) => f?.flagged).length;
  if (faded >= 2) {
    add("hold_form", `Stroke count climbed late in ${faded} of the last ${Math.min(5, fades.length)} swims.`);
    add("last_25", "Practises holding length when tired.");
  }
  if (spl > 14 || dps < 1.8) {
    add("catch_up", `About ${r1(u.per25(spl))} strokes per ${u.len} (${u.dps(dps)} per stroke): room to lengthen the stroke.`);
    add("count_down", "Builds a longer stroke you can hold at speed.");
  }
  if (rate && rate > 38 && dps < 2.1) add("six_kick", `Quick turnover (${Math.round(rate)}/min) with a short stroke: rotation and timing help it grab more water.`);
  if (rate && rate < 24 && dps >= 2.3) add("tempo_up", `Long stroke but slow turnover (${Math.round(rate)}/min): a little more tempo usually means more speed.`);
  const t = trendOf(ms, "dps");
  if (t && t.pct <= -5) add("count_down", `Distance per stroke down ${Math.abs(t.pct)}% over recent swims.`);
  if (out.some((s) => s.key === "catch_up")) add("fingertip", "Pairs with catch-up: a relaxed, high-elbow recovery.");
  return out.slice(0, 4);
}

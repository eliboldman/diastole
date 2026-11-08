// "My closet": the gear an athlete owns or can use, for planning (the AI only prescribes what they
// can actually do) and for "What to pack" on each workout. Pure module (testable with `node`).

export const SHOE_KINDS = [
  ["daily", "Daily trainer"],
  ["speed", "Speed / tempo"],
  ["race", "Race / carbon"],
  ["track", "Track (no spikes)"],
  ["spikes", "Track spikes"],
  ["trail", "Trail"],
  ["other", "Other"],
] as const;
export const BIKE_KINDS = [
  ["road", "Road"],
  ["tt", "TT / triathlon"],
  ["gravel", "Gravel"],
  ["mountain", "Mountain"],
  ["other", "Other"],
] as const;
export const TRAINER_KINDS = [
  ["none", "No trainer"],
  ["smart", "Smart trainer"],
  ["basic", "Basic trainer"],
  ["rollers", "Rollers"],
  ["spin", "Spin / gym bike"],
] as const;

/** Yes/no gear and access, each with an optional model or note. */
export const EXTRAS = [
  ["hr_strap", "Heart rate strap"],
  ["power_meter", "Bike power meter"],
  ["footpod", "Running pod / footpod"],
  ["bike_computer", "Bike computer"],
  ["treadmill", "Treadmill access"],
  ["track", "Track access"],
  ["pool", "Pool access"],
  ["wetsuit", "Wetsuit"],
  ["swim_toys", "Swim toys (paddles, pull buoy, fins)"],
  ["gym", "Gym access"],
  ["home_strength", "Home strength gear (bands, weights)"],
] as const;

export type ShoeKind = (typeof SHOE_KINDS)[number][0];
export type BikeKind = (typeof BIKE_KINDS)[number][0];
export type TrainerKind = (typeof TRAINER_KINDS)[number][0];
export type ExtraKey = (typeof EXTRAS)[number][0];

/**
 * `start_m`: distance already on the shoes when added. `since`: the day they were added (runs
 * before it don't count). `default`: unassigned runs count toward this pair. `retired`: kept for
 * history, left out of packing.
 */
export type Shoe = { id: string; model: string; kind: ShoeKind; start_m: number; since: string | null; default: boolean; retired: boolean };
export type Bike = { id: string; model: string; kind: BikeKind };
export type Closet = {
  shoes: Shoe[];
  bikes: Bike[];
  trainer: { kind: TrainerKind; model: string };
  extras: Partial<Record<ExtraKey, { model: string }>>; // present = has it
  notes: string;
};

export const EMPTY_CLOSET: Closet = { shoes: [], bikes: [], trainer: { kind: "none", model: "" }, extras: {}, notes: "" };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, list: readonly (readonly [T, string])[], fallback: T): T =>
  list.some(([k]) => k === v) ? (v as T) : fallback;
const id = (v: unknown, i: number) => (typeof v === "string" && /^[\w-]{1,40}$/.test(v) ? v : `g${i}`);

/** Accept anything (stored JSON or a form) and return a valid closet with sane limits. */
export function cleanCloset(raw: unknown): Closet {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 12) : []);
  const shoes = list(r.shoes)
    .map((s: Record<string, unknown>, i) => ({
      id: id(s?.id, i),
      model: text(s?.model, 60),
      kind: oneOf(s?.kind, SHOE_KINDS, "daily"),
      start_m: typeof s?.start_m === "number" && Number.isFinite(s.start_m) ? Math.min(Math.max(0, Math.round(s.start_m)), 5_000_000) : 0,
      since: typeof s?.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.since) ? s.since : null,
      default: s?.default === true,
      retired: s?.retired === true,
    }))
    .filter((s) => s.model);
  // At most one default, and never a retired pair.
  let seenDefault = false;
  for (const sh of shoes) {
    if (sh.default && !sh.retired && !seenDefault) seenDefault = true;
    else sh.default = false;
  }
  const bikes = list(r.bikes)
    .map((b: Record<string, unknown>, i) => ({ id: id(b?.id, i), model: text(b?.model, 60), kind: oneOf(b?.kind, BIKE_KINDS, "road") }))
    .filter((b) => b.model);
  const t = (r.trainer && typeof r.trainer === "object" ? r.trainer : {}) as Record<string, unknown>;
  const trainerKind = oneOf(t.kind, TRAINER_KINDS, "none");
  const ex = (r.extras && typeof r.extras === "object" ? r.extras : {}) as Record<string, unknown>;
  const extras: Closet["extras"] = {};
  for (const [k] of EXTRAS) {
    const v = ex[k];
    if (v) extras[k] = { model: text((v as Record<string, unknown>)?.model, 60) };
  }
  return { shoes, bikes, trainer: { kind: trainerKind, model: trainerKind === "none" ? "" : text(t.model, 60) }, extras, notes: text(r.notes, 500) };
}

export const isEmptyCloset = (c: Closet) => !c.shoes.length && !c.bikes.length && c.trainer.kind === "none" && !Object.keys(c.extras).length && !c.notes;

const label = (list: readonly (readonly [string, string])[], k: string) => list.find(([x]) => x === k)?.[1] ?? k;

/** Short lines for the planner, e.g. "Bikes: Cervelo P3 (TT / triathlon)". Null when nothing is filled in. */
export function closetForPrompt(c: Closet): string[] | null {
  if (isEmptyCloset(c)) return null;
  const lines: string[] = [];
  const shoes = c.shoes.filter((s) => !s.retired);
  lines.push(shoes.length ? `Shoes: ${shoes.map((s) => `${s.model} (${label(SHOE_KINDS, s.kind).toLowerCase()})`).join("; ")}` : "Shoes: none listed");
  lines.push(c.bikes.length ? `Bikes: ${c.bikes.map((b) => `${b.model} (${label(BIKE_KINDS, b.kind)})`).join("; ")}` : "Bikes: none");
  lines.push(`Indoor trainer: ${c.trainer.kind === "none" ? "none" : `${label(TRAINER_KINDS, c.trainer.kind)}${c.trainer.model ? `, ${c.trainer.model}` : ""}`}`);
  const have = EXTRAS.filter(([k]) => c.extras[k]).map(([k, l]) => `${l}${c.extras[k]!.model ? ` (${c.extras[k]!.model})` : ""}`);
  const missing = EXTRAS.filter(([k]) => !c.extras[k]).map(([, l]) => l.split(" (")[0].toLowerCase());
  if (have.length) lines.push(`Has: ${have.join("; ")}`);
  lines.push(`Does not have: ${missing.join(", ")}`);
  if (c.notes) lines.push(`Athlete's note: ${c.notes}`);
  return lines;
}

// ---------------------------------------------------------------- shoe mileage

/** Common replacement window for running shoes: a heads-up at 300 mi, "time to replace" at 400 mi. */
export const SHOE_WORN_M = 482_803;
export const SHOE_REPLACE_M = 643_738;

/** The pair unassigned runs count toward: the marked default, else the first daily trainer, else the first pair. */
export function defaultShoe(c: Closet): Shoe | null {
  const active = c.shoes.filter((s) => !s.retired);
  return active.find((s) => s.default) ?? active.find((s) => s.kind === "daily") ?? active[0] ?? null;
}

export type RunForShoes = { id: string; date: string; distance_m: number | null };

/** Meters on each pair: starting distance + runs assigned to it + unassigned runs (default pair, on or after its `since`). */
export function shoeMileage(c: Closet, runs: RunForShoes[], assigned: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(c.shoes.map((s) => [s.id, s.start_m]));
  const def = defaultShoe(c);
  for (const r of runs) {
    const d = r.distance_m ?? 0;
    if (d <= 0) continue;
    const to = assigned[r.id];
    if (to) {
      if (to in out) out[to] += d;
    } else if (def && (!def.since || r.date >= def.since)) out[def.id] += d;
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}

export function shoeWear(m: number): "fresh" | "worn" | "replace" {
  return m >= SHOE_REPLACE_M ? "replace" : m >= SHOE_WORN_M ? "worn" : "fresh";
}

// ---------------------------------------------------------------- what to pack

export type PackWorkout = { sport: string | null; title: string | null; description?: string | null; pool_length?: number | null };
export type PackItem = { item: string; why?: string };

const has = (s: string, re: RegExp) => re.test(s);

/**
 * A packing list for one workout from its sport and wording plus the athlete's closet. Rule-based
 * and conservative: it names the athlete's own gear where it can, and general items otherwise.
 */
export function packFor(w: PackWorkout, closet: Closet, mileage: Record<string, number> = {}): PackItem[] {
  const c = { ...closet, shoes: closet.shoes.filter((s) => !s.retired) };
  const sport = (w.sport ?? "").toLowerCase();
  const words = `${w.title ?? ""} ${w.description ?? ""}`.toLowerCase();
  const out: PackItem[] = [];
  const shoe = (kind: ShoeKind) => c.shoes.find((s) => s.kind === kind);
  const bike = (kind: BikeKind) => c.bikes.find((b) => b.kind === kind);
  const extra = (k: ExtraKey, fallback: string) => (c.extras[k] ? c.extras[k]!.model || fallback : null);

  if (/run/.test(sport)) {
    const trail = has(words, /trail|hills? repeats?|off.?road/);
    const track = has(words, /track|spikes|400s?|800s?|200s?|\boval\b/);
    const raceDay = has(words, /\brace\b|time trial|\btt\b|goal pace|race pace|race day/);
    const fast = raceDay || has(words, /tempo|threshold|interval|vo2|repeats?|strides|fartlek/);
    const treadmill = has(words, /treadmill/);
    // Track: spikes, else track flats, else the fastest road pair. Race efforts: carbon first. Other
    // fast work: speed shoes first, saving the race pair.
    const pick = trail
      ? shoe("trail")
      : track
        ? shoe("spikes") ?? shoe("track") ?? shoe("race") ?? shoe("speed")
        : raceDay
          ? shoe("race") ?? shoe("speed")
          : fast
            ? shoe("speed") ?? shoe("race")
            : null;
    const daily = defaultShoe(c);
    if (pick) out.push({ item: pick.model, why: trail ? "Trail shoes for this route" : track ? "Fast shoes for the track" : "Workout shoes for the fast parts" });
    if (daily && daily !== pick) out.push({ item: daily.model, why: pick ? "To warm up and cool down in" : undefined });
    if (!pick && !daily) out.push({ item: trail ? "Trail shoes" : "Running shoes" });
    for (const p of out) {
      const sh = c.shoes.find((x) => x.model === p.item);
      if (sh && mileage[sh.id] !== undefined && shoeWear(mileage[sh.id]) === "replace") p.why = `${p.why ? `${p.why}. ` : ""}These are past 400 miles: time to think about a new pair`;
    }
    if (track && !c.extras.track) out.push({ item: "Find a track", why: "This one is written for a track" });
    if (treadmill) out.push({ item: c.extras.treadmill ? "Treadmill" : "Treadmill (you haven't listed access)" });
  } else if (/cycl|bik|ride|spin/.test(sport)) {
    const indoor = has(words, /indoor|trainer|zwift|rouvy|erg|turbo|spin/) || (!c.bikes.length && c.trainer.kind !== "none");
    const tt = has(words, /\btt\b|time trial|aero|race pace|tri(athlon)? bike/);
    if (indoor) {
      out.push({ item: c.trainer.kind === "none" ? "Indoor trainer or spin bike" : c.trainer.model || label(TRAINER_KINDS, c.trainer.kind) });
      const onTrainer = bike("road") ?? c.bikes[0];
      if (onTrainer && c.trainer.kind !== "spin") out.push({ item: onTrainer.model, why: "On the trainer" });
      out.push({ item: "Towel, fan and a big bottle" });
    } else {
      const ride = (tt ? bike("tt") : null) ?? (has(words, /gravel|dirt/) ? bike("gravel") : null) ?? bike("road") ?? c.bikes[0];
      out.push({ item: ride?.model ?? "Bike", why: tt && ride?.kind === "tt" ? "TT bike for the race-pace work" : undefined });
      out.push({ item: "Helmet, bottles and a flat kit" });
      const computer = extra("bike_computer", "Bike computer");
      if (computer) out.push({ item: computer });
    }
    if (has(words, /watts|power|ftp|% ?ftp|\bw\b/) && !c.extras.power_meter && c.trainer.kind !== "smart") out.push({ item: "Ride by heart rate or feel", why: "This one has power targets and you haven't listed a power meter" });
  } else if (/swim/.test(sport)) {
    const open = has(words, /open water|lake|ocean|sea|wetsuit/);
    out.push({ item: open ? "Goggles, bright cap and a tow float" : "Goggles, cap and suit" });
    if (open) out.push({ item: extra("wetsuit", "Wetsuit") ?? "Wetsuit (if the water is cold)" });
    if (has(words, /pull|paddles?|fins?|kick ?board|buoy/)) out.push({ item: extra("swim_toys", "Paddles, pull buoy and fins") ?? "Pull buoy, paddles or fins (borrow at the pool)" });
    if (!open && !c.extras.pool) out.push({ item: "Find a pool", why: "You haven't listed pool access" });
  } else if (/strength|gym|weight/.test(sport)) {
    out.push({ item: c.extras.gym ? "Gym bag" : c.extras.home_strength ? c.extras.home_strength.model || "Bands and weights" : "A spot to train (gym or home)" });
    out.push({ item: "Training shoes and a towel" });
  }

  const hr = extra("hr_strap", "Heart rate strap");
  if (hr && /run|cycl|bik|ride/.test(sport)) out.push({ item: hr });
  if (/run/.test(sport)) {
    const pod = extra("footpod", "Running pod");
    if (pod) out.push({ item: pod });
  }
  return out;
}

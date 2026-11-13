// One-off: load the IRONMAN 70.3 Panama City Beach plan (pcb-703-2027) onto the owner's own calendar.
//
//   node scripts/import-pcb-plan.ts --plan <unzipped folder> --dry-run
//   node scripts/import-pcb-plan.ts --plan <folder> --from 2026-11-23 --to 2026-11-29
//   node scripts/import-pcb-plan.ts --plan <folder>                  # everything from today on
//   node scripts/import-pcb-plan.ts --send-only                       # just send the next 7 days to Garmin
//
// Options: --athlete <uuid> (default: the owner account, profiles.is_admin), --no-send.
//
// What it does (see DIASTOLE-HANDOFF.md in the zip):
//  * Each sessions/*.json is parsed with parseWorkoutJson (run, bike, swim). Every target is then
//    re-worked from the step's "rel" with the athlete's current zones (FTP, threshold pace, CSS); the
//    printed paces are ignored. goal_race_pace steps stay at their fixed pace.
//  * Rows go straight into planned_workouts as approved (scheduled) sessions, coach = athlete, not
//    as requests. A brick_with pair becomes one bike row with the run in `brick`. Strength sessions
//    map exercise names to lib/strength/catalog slugs; anything without a slug stays as a note.
//  * plan_meta keeps the plan object, the raw steps with "rel", and an import hash. Matching is on
//    plan_meta->>'session_id': a re-run updates in place, never duplicates.
//  * Skips past dates; skips already_scheduled sessions when that sport is already on that day;
//    never touches a row whose content changed since the import wrote it (or that was deleted).
//  * Garmin: only approved, unsent sessions in the next 7 days are sent (plus re-sends of sent rows
//    this run updated). Later sessions wait; run --send-only again to roll the window forward.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { parseWorkoutJson } from "../lib/workouts/json-import.ts";
import { toGarminWorkout, validateSteps, type Brick, type Pool, type PoolUnit, type Sport, type Step, type Target } from "../lib/workouts/garmin-format.ts";
import { BY_SLUG } from "../lib/strength/catalog.ts";
import { toGarminStrength, validateStrength, type StrengthItem } from "../lib/strength/workout.ts";

// ------------------------------------------------------------------ args
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY = flag("--dry-run");
const SEND_ONLY = flag("--send-only");
const NO_SEND = flag("--no-send");
const FROM = opt("--from");
const TO = opt("--to");
const PLAN_DIR = opt("--plan");
const isDate = (s: string | undefined) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);
if (!isDate(FROM) || !isDate(TO)) fail("--from/--to must be YYYY-MM-DD");
if (!SEND_ONLY && (!PLAN_DIR || !existsSync(join(resolve(PLAN_DIR), "sessions")))) fail("--plan <folder> must point at the unzipped plan (with sessions/)");

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

// ------------------------------------------------------------------ supabase
const env = Object.fromEntries(
  (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "")
    .split("\n")
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) fail("Run from the repo root; needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const athleteArg = opt("--athlete");
const { data: me, error: meErr } = athleteArg
  ? await db.from("profiles").select("id, full_name, timezone, units, is_test").eq("id", athleteArg).single()
  : await db.from("profiles").select("id, full_name, timezone, units, is_test").eq("is_admin", true).single();
if (meErr || !me) fail(`Athlete not found: ${meErr?.message ?? ""}`);
const ATHLETE = me.id as string;
const TZ = (me.timezone as string | null) || Intl.DateTimeFormat().resolvedOptions().timeZone;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const SEND_UNTIL = addDays(today, 6); // today + the next six days = 7 days

console.log(`${DRY ? "DRY RUN · " : ""}Athlete: ${me.full_name} · today ${today} (${TZ}) · Garmin window ${today}…${SEND_UNTIL}`);

// ------------------------------------------------------------------ zones
const { data: z } = await db.from("athlete_zones").select("ftp_w, threshold_speed_mps, css_sec_per_100m").eq("athlete_id", ATHLETE).maybeSingle();
const FTP = z?.ftp_w ? Number(z.ftp_w) : null;
const THR_MPS = z?.threshold_speed_mps ? Number(z.threshold_speed_mps) : null;
const CSS_100M = z?.css_sec_per_100m ? Number(z.css_sec_per_100m) : null;
const MILE = 1609.344;
const YARD = 0.9144;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
if (!SEND_ONLY) {
  console.log(
    `Zones: FTP ${FTP ?? "—"} W · threshold ${THR_MPS ? clock(MILE / THR_MPS) + "/mi" : "—"} · CSS ${CSS_100M ? clock(CSS_100M * YARD) + "/100yd" : "—"}`,
  );
  if (!FTP || !THR_MPS || !CSS_100M) fail("Set FTP, threshold pace and CSS first: targets are resolved from them.");
}

// ------------------------------------------------------------------ targets from rel
type Rel =
  | { basis: "ftp"; pct: [number, number] }
  | { basis: "threshold_pace"; pct_of_threshold_speed: [number, number] }
  | { basis: "css"; offset_sec_per_100: number }
  | { basis: "goal_race_pace"; pace_sec_per_mi: [number, number] };
type RawStep = { rel?: Rel; repeat?: number; steps?: RawStep[]; [k: string]: unknown };
const round1 = (v: number) => Math.round(v * 10) / 10;

/** The step's target from its rel and the current zones, in the app's own format (with the app's rel %, so later zone changes can re-scale it). */
function targetFrom(rel: Rel, pool: Pool): Target & { rel?: { pct: [number, number]; of?: "css" } } {
  switch (rel.basis) {
    case "ftp": {
      const [lo, hi] = rel.pct;
      return { type: "power_range", low: Math.round((FTP! * lo) / 100), high: Math.round((FTP! * hi) / 100), rel: { pct: [lo, hi] } };
    }
    case "threshold_pace": {
      // Higher % = faster. Same arithmetic as lib/workouts/relative.ts resolve().
      const [lo, hi] = rel.pct_of_threshold_speed;
      return { type: "pace_range", slowSecPerKm: Math.round(1000 / ((THR_MPS! * lo) / 100)), fastSecPerKm: Math.round(1000 / ((THR_MPS! * hi) / 100)), rel: { pct: [lo, hi] } };
    }
    case "css": {
      const unitM = pool?.unit === "METER" ? 100 : 100 * YARD; // metres in "100" of the pool's unit
      const secPer100 = Math.round(CSS_100M! * (unitM / 100) + rel.offset_sec_per_100);
      const pct = round1((unitM / secPer100 / (100 / CSS_100M!)) * 100);
      return { type: "swim_pace", secPer100, rel: { pct: [pct, pct], of: "css" } };
    }
    case "goal_race_pace": {
      // Fixed goal pace (reset from Checkpoint 3), deliberately without a % so zone changes don't move it.
      const [fast, slow] = rel.pace_sec_per_mi;
      return { type: "pace_range", fastSecPerKm: Math.round((fast * 1000) / MILE), slowSecPerKm: Math.round((slow * 1000) / MILE) };
    }
  }
}

/** Walk parsed steps and raw steps together (same shape) and replace each target that has a rel. */
function applyRel(parsed: Step[], raw: RawStep[], pool: Pool): Step[] {
  if (parsed.length !== raw.length) throw new Error("step count changed while parsing");
  return parsed.map((s, i) => {
    const r = raw[i];
    if (s.kind === "repeat") return { ...s, steps: applyRel(s.steps, r.steps ?? [], pool) };
    return r.rel ? { ...s, target: targetFrom(r.rel, pool) } : s;
  });
}

// ------------------------------------------------------------------ strength
const NAME_TO_SLUGS: Record<string, { slug: string; note?: string }[]> = {
  "goblet squat": [{ slug: "goblet-squat" }],
  "split squat": [{ slug: "split-squat", note: "Split squat: rear foot on the floor" }],
  "bulgarian split squat": [{ slug: "split-squat" }],
  "romanian deadlift": [{ slug: "rdl" }],
  "single-leg rdl": [{ slug: "single-leg-rdl" }],
  "calf raise, straight + bent knee": [{ slug: "calf-raise" }, { slug: "seated-calf-raise" }],
  "calf raise": [{ slug: "calf-raise" }],
  "heavy calf raise": [{ slug: "calf-raise", note: "Heavy" }],
  "side plank": [{ slug: "side-plank" }],
  "dead bug": [{ slug: "dead-bug" }],
  "bodyweight squat": [{ slug: "goblet-squat", note: "Bodyweight squat, no weight" }],
  "glute bridge": [{ slug: "glute-bridge" }],
  "back squat or trap-bar deadlift": [{ slug: "back-squat", note: "Or trap-bar deadlift" }],
  "trap-bar deadlift": [{ slug: "deadlift", note: "Trap bar" }],
  "pallof press": [{ slug: "pallof-press" }],
  "pull-ups": [{ slug: "pull-up" }],
  "step-up": [{ slug: "step-up" }],
  "copenhagen plank": [{ slug: "copenhagen" }],
};

/** "3x12", "3x10/leg", "3x30 s/side", "4x5, heavy, 2-3 min rest", "3x6-8" → sets/reps/seconds/rest/note. */
function prescription(p: string, slug: string): Omit<StrengthItem, "slug"> | null {
  const m = /^(\d+)\s*x\s*(\d+)(?:-(\d+))?\s*(s\b)?/i.exec(p.trim());
  if (!m) return null;
  const ex = BY_SLUG.get(slug)!;
  const sets = Number(m[1]);
  const n = Number(m[2]);
  const timed = Boolean(m[4]) || ex.hold;
  const restM = /(\d+)(?:-(\d+))?\s*min rest/i.exec(p);
  const rest_s = restM ? Math.round(((Number(restM[1]) + Number(restM[2] ?? restM[1])) / 2) * 60) : ex.heavy ? 120 : ex.load === "weight" ? 75 : 45;
  const extras = p.split(",").slice(1).map((x) => x.trim()).filter((x) => x && !/min rest/i.test(x));
  if (m[3]) extras.unshift(`${m[2]}–${m[3]} reps`);
  return { sets, reps: timed ? null : n, seconds: timed ? n : null, kg: null, rest_s, note: extras.join(", ") || null };
}

function strengthItems(exercises: { name: string; prescription: string }[]): { items: StrengthItem[]; unmatched: string[] } {
  const items: StrengthItem[] = [];
  const unmatched: string[] = [];
  for (const e of exercises) {
    const maps = NAME_TO_SLUGS[e.name.trim().toLowerCase()];
    const parsed = maps?.map((m) => ({ m, p: prescription(e.prescription, m.slug) }));
    if (!maps || parsed!.some((x) => !x.p)) {
      unmatched.push(`${e.name} ${e.prescription}`);
      continue;
    }
    for (const { m, p } of parsed!) items.push({ slug: m.slug, ...p!, note: [m.note, p!.note].filter(Boolean).join(" · ") || null });
  }
  return { items, unmatched };
}

// ------------------------------------------------------------------ build rows
type Plan = {
  plan_id: string; session_id: string; week: number; phase: string; day: string; order: number; start_time: string;
  planned_duration_min: number; category: string; is_key: boolean; already_scheduled: boolean; brick_with?: string;
  location?: string; exercises?: { name: string; prescription: string }[]; [k: string]: unknown;
};
type RawWorkout = { title: string; sport: string; date: string; description: string; steps: RawStep[]; pool?: string; pace_unit?: string; plan: Plan };
type Row = {
  session_id: string; label: string; plan: Plan; brickHalf?: Plan;
  content: { scheduled_date: string; sport: string; title: string; description: string | null; steps: Step[]; brick: Brick; strength: StrengthItem[] | null; start_time: string | null; pool_length: number | null; pool_unit: PoolUnit | null };
  meta: Record<string, unknown>; problems: string[];
};

const CONTENT_KEYS = ["scheduled_date", "sport", "title", "description", "steps", "brick", "strength", "start_time", "pool_length", "pool_unit"] as const;
const stable = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])])) : v;
const normTime = (t: unknown) => (typeof t === "string" ? t.slice(0, 5) : null); // "05:00:00" from the db → "05:00"
/** Fingerprint of what the import writes, so a later edit in the app (or a reschedule) is detectable. */
function hashOf(c: Record<string, unknown>): string {
  const pick = Object.fromEntries(CONTENT_KEYS.map((k) => [k, k === "start_time" ? normTime(c[k]) : k === "pool_length" && c[k] != null ? Number(c[k]) : (c[k] ?? null)]));
  return createHash("sha256").update(JSON.stringify(stable(pick))).digest("hex").slice(0, 16);
}

function parseOne(w: RawWorkout): { steps: Step[]; pool: Pool; problems: string[] } {
  const res = parseWorkoutJson(JSON.stringify({ workouts: [w] }), { paceUnit: "mi", ftp: FTP });
  if (res.errors.length || !res.workouts[0]) return { steps: [], pool: null, problems: res.errors.length ? res.errors : ["did not parse"] };
  const pw = res.workouts[0];
  const steps = applyRel(pw.steps, w.steps, pw.pool);
  const problems = validateSteps(steps, 0, pw.sport, pw.pool);
  return { steps, pool: pw.pool, problems: [...new Set(problems)] };
}

function buildRows(dir: string): { rows: Row[]; restDays: number } {
  const files = readdirSync(join(dir, "sessions")).filter((f) => f.endsWith(".json")).sort();
  const all: RawWorkout[] = files.map((f) => {
    const j = JSON.parse(readFileSync(join(dir, "sessions", f), "utf8"));
    if (!Array.isArray(j.workouts) || j.workouts.length !== 1) throw new Error(`${f}: expected one workout`);
    return j.workouts[0];
  });
  const bySession = new Map(all.map((w) => [w.plan.session_id, w]));
  const rows: Row[] = [];
  for (const w of all) {
    const plan = w.plan;
    // The run half of a brick rides on the bike row.
    if (plan.brick_with && w.sport === "run" && bySession.get(plan.brick_with)?.sport === "bike") continue;
    const problems: string[] = [];
    const desc: string[] = [w.description];
    if (plan.location) desc.push(`Location: ${plan.location}`);
    let steps: Step[] = [];
    let pool: Pool = null;
    let brick: Brick = null;
    let strength: StrengthItem[] | null = null;
    let title = w.title;
    let brickHalf: Plan | undefined;
    const meta: Record<string, unknown> = { ...plan, steps_rel: w.steps, brick: null };

    if (w.sport === "strength") {
      const { items, unmatched } = strengthItems(plan.exercises ?? []);
      strength = items;
      if (unmatched.length) desc.push(`Also: ${unmatched.join("; ")}`);
      problems.push(...validateStrength(items));
    } else {
      const p = parseOne(w);
      steps = p.steps;
      pool = p.pool;
      problems.push(...p.problems);
      if (plan.brick_with) {
        const run = bySession.get(plan.brick_with);
        if (!run || run.sport !== "run" || run.date !== w.date || run.plan.brick_with !== plan.session_id) problems.push(`brick partner ${plan.brick_with} missing or mismatched`);
        else {
          const r = parseOne(run);
          problems.push(...r.problems.map((x) => `run off the bike: ${x}`));
          brick = { sport: "run", steps: r.steps };
          brickHalf = run.plan;
          meta.brick = { session_id: run.plan.session_id, plan: run.plan, steps_rel: run.steps };
          const both = `${w.title} + ${run.title}`;
          if (both.length <= 100) title = both;
          desc.push(`Run off the bike: ${run.title}. ${run.description}`);
        }
      }
    }
    const description = desc.filter(Boolean).join("\n\n").slice(0, 1024) || null;
    rows.push({
      session_id: plan.session_id,
      label: `${w.date} ${w.sport}${brick ? "+run" : ""} ${title}`,
      plan,
      brickHalf,
      content: {
        scheduled_date: w.date, sport: w.sport, title: title.slice(0, 100), description, steps, brick, strength,
        start_time: /^\d{2}:\d{2}$/.test(plan.start_time) ? plan.start_time : null,
        pool_length: pool?.length ?? null, pool_unit: pool?.unit ?? null,
      },
      meta,
      problems,
    });
  }
  const planJson = existsSync(join(dir, "plan.json")) ? JSON.parse(readFileSync(join(dir, "plan.json"), "utf8")) : null;
  const restDays = Array.isArray(planJson?.rest_days) ? planJson.rest_days.length : 0;
  return { rows, restDays };
}

// ------------------------------------------------------------------ import
const resend = new Set<string>(); // sent rows whose content this run changed
if (!SEND_ONLY) {
  const { rows } = buildRows(resolve(PLAN_DIR!));
  const inRange = rows.filter((r) => (!FROM || r.content.scheduled_date >= FROM) && (!TO || r.content.scheduled_date <= TO));

  const { data: existing, error: exErr } = await db
    .from("planned_workouts")
    .select("id, scheduled_date, sport, title, description, steps, brick, strength, start_time, pool_length, pool_unit, status, external_id, deleted_at, plan_meta")
    .eq("athlete_id", ATHLETE)
    .gte("scheduled_date", FROM && FROM > today ? FROM : today);
  if (exErr) fail(`Couldn't read the calendar: ${exErr.message} (is the plan_meta migration applied?)`);
  const bySession = new Map((existing ?? []).filter((e) => e.plan_meta?.session_id).map((e) => [e.plan_meta.session_id as string, e]));
  // Sports already on each day, from anything not from this import (a bike row with a brick counts as run too).
  const dayHas = new Set<string>();
  for (const e of existing ?? []) {
    if (e.deleted_at || e.plan_meta?.session_id) continue;
    dayHas.add(`${e.scheduled_date}:${e.sport}`);
    if (e.brick) dayHas.add(`${e.scheduled_date}:run`);
  }

  const out = { insert: [] as Row[], update: [] as Row[], same: 0, past: 0, already: [] as string[], edited: [] as string[], invalid: [] as string[] };
  for (const r of inRange) {
    if (r.content.scheduled_date < today) {
      out.past++;
      continue;
    }
    if (r.problems.length) {
      out.invalid.push(`${r.label}: ${r.problems.slice(0, 2).join(" ")}`);
      continue;
    }
    const prev = bySession.get(r.session_id);
    if (!prev) {
      const sports = [r.content.sport, ...(r.content.brick ? ["run"] : [])];
      if (r.plan.already_scheduled && sports.some((s) => dayHas.has(`${r.content.scheduled_date}:${s}`))) {
        out.already.push(r.label);
        continue;
      }
      out.insert.push(r);
      continue;
    }
    if (prev.deleted_at || hashOf(prev) !== prev.plan_meta?.import_hash) {
      out.edited.push(`${r.label}${prev.deleted_at ? " (deleted)" : ""}`);
      continue;
    }
    if (hashOf(r.content) === prev.plan_meta.import_hash) out.same++;
    else {
      out.update.push(r);
      if (prev.external_id) resend.add(prev.id);
    }
  }

  const range = `${FROM ?? "start"} … ${TO ?? "end"}`;
  console.log(`\nPlan sessions in range (${range}): ${inRange.length} rows (bricks merged) from ${rows.length} total`);
  console.log(`  insert ${out.insert.length} · update ${out.update.length} · unchanged ${out.same} · past ${out.past} · already scheduled ${out.already.length} · edited since import ${out.edited.length} · invalid ${out.invalid.length}`);
  const list = (title: string, items: string[]) => items.length && console.log(`\n${title}:\n  ${items.join("\n  ")}`);
  list("Skipped, already on the calendar", out.already);
  list("Skipped, edited or deleted since import", out.edited);
  list("Skipped, invalid", out.invalid);
  if (DRY) {
    // Every row must convert to a Garmin workout (bricks as multisport, strength as a strength workout).
    const bad = [...out.insert, ...out.update].flatMap((r) => {
      try {
        const c = r.content;
        if (c.sport === "strength") toGarminStrength(c.title, c.strength ?? [], "lb", c.description);
        else toGarminWorkout({ title: c.title, description: c.description, sport: c.sport as Sport, steps: c.steps, pool: c.pool_length ? { length: c.pool_length, unit: c.pool_unit! } : null, brick: c.brick });
        return [];
      } catch (e) {
        return [`${r.label}: ${(e as Error).message}`];
      }
    });
    console.log(`\nGarmin conversion check: ${bad.length ? bad.length + " failed" : "all rows convert"}`);
    list("Would not convert", bad);
    list("Would insert", out.insert.map((r) => r.label));
    list("Would update", out.update.map((r) => r.label));
    const sample = out.insert.find((r) => r.content.sport === "bike" && r.content.brick) ?? out.insert[0];
    if (sample) console.log(`\nSample row (${sample.label}):\n${JSON.stringify({ ...sample.content, description: sample.content.description?.slice(0, 120) + "…" }, null, 1).slice(0, 2500)}`);
  } else {
    const now = new Date().toISOString();
    const write = (r: Row) => ({
      ...r.content,
      plan_meta: { ...r.meta, import_hash: hashOf(r.content), imported_at: now },
    });
    for (const r of out.insert) {
      const { error } = await db.from("planned_workouts").insert({
        ...write(r), athlete_id: ATHLETE, coach_id: ATHLETE, status: "approved", approved_at: now, requested_by: null,
      });
      if (error) console.error(`  insert failed ${r.label}: ${error.message}`);
    }
    for (const r of out.update) {
      const prev = bySession.get(r.session_id)!;
      const { error } = await db.from("planned_workouts").update({ ...write(r), updated_at: now }).eq("id", prev.id);
      if (error) console.error(`  update failed ${r.label}: ${error.message}`);
    }
    console.log(`\nWrote ${out.insert.length} new and ${out.update.length} updated sessions.`);
  }
}

// ------------------------------------------------------------------ Garmin (next 7 days only)
if (NO_SEND) process.exit(0);
const { data: device } = await db.from("device_connections").select("source").eq("athlete_id", ATHLETE).eq("source", "garmin").maybeSingle();
if (!device) {
  console.log("\nNo Garmin connection: nothing sent.");
  process.exit(0);
}
if (me.is_test) fail("Test athletes never receive workouts on a watch.");

const { data: due } = await db
  .from("planned_workouts")
  .select("id, scheduled_date, sport, title, description, steps, status, approved_at, external_id, pool_length, pool_unit, brick, strength, plan_meta")
  .eq("athlete_id", ATHLETE)
  .is("deleted_at", null)
  .gte("scheduled_date", today)
  .lte("scheduled_date", SEND_UNTIL)
  .not("plan_meta", "is", null)
  .order("scheduled_date");
const toSend = (due ?? []).filter((w) => w.approved_at && ((w.status === "approved" && !w.external_id) || (w.external_id && resend.has(w.id))));
// Sent rows updated by this run but outside the window still get refreshed on the watch.
const outside = [...resend].filter((id) => !toSend.some((w) => w.id === id));
console.log(`\nGarmin: ${toSend.length} to send in ${today}…${SEND_UNTIL}${outside.length ? `, ${outside.length} re-sends outside the window` : ""}.`);
for (const w of toSend) console.log(`  ${w.scheduled_date} ${w.sport} ${w.title}${w.external_id ? " (re-send)" : ""}`);
if (DRY) process.exit(0);

const GARMIN_API = "https://apis.garmin.com";
let token: string | null = null;
async function accessToken(): Promise<string> {
  if (token) return token;
  const { data, error } = await db.rpc("get_garmin_tokens", { p_athlete: ATHLETE });
  if (error || !data?.[0]) throw new Error(`No Garmin tokens: ${error?.message ?? "none"}`);
  const row = data[0];
  if (new Date(row.expires_at).getTime() > Date.now()) return (token = row.access_token as string);
  // Same refresh as lib/garmin/client.ts (Basic auth on diauth first, body credentials as fallback).
  for (const v of [{ host: "https://diauth.garmin.com", basic: true }, { host: "https://connectapi.garmin.com", basic: false }]) {
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: row.refresh_token });
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (v.basic) headers.Authorization = `Basic ${Buffer.from(`${env.GARMIN_CLIENT_ID.trim()}:${env.GARMIN_CLIENT_SECRET.trim()}`).toString("base64")}`;
    else {
      body.set("client_id", env.GARMIN_CLIENT_ID.trim());
      body.set("client_secret", env.GARMIN_CLIENT_SECRET.trim());
    }
    const res = await fetch(`${v.host}/di-oauth2-service/oauth/token`, { method: "POST", headers, body });
    if (!res.ok) continue;
    const t = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    const { error: saveErr } = await db.rpc("save_garmin_tokens", {
      p_athlete: ATHLETE, p_access: t.access_token, p_refresh: t.refresh_token, p_expires_at: new Date(Date.now() + (t.expires_in - 600) * 1000).toISOString(),
    });
    if (saveErr) throw new Error(`Refreshed the Garmin token but couldn't save it: ${saveErr.message}`);
    return (token = t.access_token);
  }
  throw new Error("Garmin token refresh failed.");
}
const garmin = async (path: string, init: RequestInit = {}) => fetch(`${GARMIN_API}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await accessToken()}` } });

async function removeFromGarmin(id: string) {
  const { data: w } = await db.from("planned_workouts").select("external_id, garmin_schedule_id").eq("id", id).single();
  if (!w?.external_id) return;
  if (w.garmin_schedule_id) await garmin(`/training-api/schedule/${w.garmin_schedule_id}`, { method: "DELETE" });
  const res = await garmin(`/training-api/workout/v2/${w.external_id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Garmin couldn't remove the old copy (${res.status})`);
  await db.from("planned_workouts").update({ external_id: null, garmin_schedule_id: null }).eq("id", id);
}

/** Mirrors lib/garmin/training.ts sendWorkoutToGarmin (that module is server-only). */
async function sendOne(id: string) {
  const { data: w } = await db
    .from("planned_workouts")
    .select("id, scheduled_date, sport, title, description, steps, status, approved_at, external_id, pool_length, pool_unit, brick, strength")
    .eq("id", id)
    .single();
  if (!w?.approved_at || (w.status !== "approved" && w.status !== "sent")) throw new Error("not approved");
  if (w.external_id) throw new Error("already on Garmin");
  const body =
    w.sport === "strength"
      ? toGarminStrength(w.title, (w.strength ?? []) as StrengthItem[], me!.units === "km" ? "kg" : "lb", w.description)
      : toGarminWorkout({
          title: w.title, description: w.description, sport: w.sport as Sport, steps: w.steps as Step[],
          pool: w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit as PoolUnit } : null,
          brick: (w.brick ?? null) as Brick,
        });
  const created = await garmin("/workoutportal/workout/v2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!created.ok) throw new Error(`Garmin rejected it (${created.status}): ${(await created.text()).slice(0, 200)}`);
  const { workoutId } = (await created.json()) as { workoutId: number };
  const scheduled = await garmin("/training-api/schedule/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workoutId, date: w.scheduled_date }) });
  if (!scheduled.ok) {
    await garmin(`/training-api/workout/v2/${workoutId}`, { method: "DELETE" }).catch(() => {});
    throw new Error(`Garmin couldn't schedule it (${scheduled.status})`);
  }
  const text = await scheduled.text();
  let scheduleId: string | null = null;
  try {
    const p = JSON.parse(text);
    scheduleId = String(typeof p === "object" && p ? (p.scheduleId ?? p.id ?? "") : p) || null;
  } catch {
    scheduleId = text.trim() || null;
  }
  await db.from("planned_workouts").update({ status: "sent", sent_at: new Date().toISOString(), external_id: String(workoutId), garmin_schedule_id: scheduleId }).eq("id", w.id);
}

let sent = 0;
for (const id of [...toSend.map((w) => w.id), ...outside]) {
  try {
    if (resend.has(id)) await removeFromGarmin(id);
    await sendOne(id);
    sent++;
  } catch (e) {
    console.error(`  send failed ${id}: ${(e as Error).message}`);
  }
}
console.log(`Sent ${sent} to Garmin. Later sessions are scheduled in Diastole; run with --send-only to send the next 7 days.`);

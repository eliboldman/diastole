// One-off: set up Eli's race-weight goal (2026-11-14) and preview the daily targets it produces.
//
//   node scripts/weight-goal-setup.ts --dry-run            # prints the rows it would write + a 4-week preview; writes nothing
//   node scripts/weight-goal-setup.ts --apply              # writes the goal row and the first weigh-in
//   node scripts/weight-goal-setup.ts --dry-run --weeks 6  # longer preview
//
// Needs the 20270205000000_weight_goal migration for --apply (the dry run works without it).

import { existsSync, readFileSync } from "node:fs";

import { isKeySession } from "../lib/training/alerts.ts";
import type { Step } from "../lib/workouts/garmin-format.ts";
import { LB, addDays, plannedKg, estimatedBaseline, isBig, isKey, isTest, keyWithoutPlan, mondayOf, planWeekTargets, plannedEnergy, type DayInput, type Goal, type PlannedSession, type Week } from "../lib/fuel/weight-plan.ts";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DRY = !APPLY || args.includes("--dry-run");
if (APPLY && args.includes("--dry-run")) fail("Pick one: --dry-run or --apply");
const weeksArg = args.indexOf("--weeks");
const WEEKS = weeksArg >= 0 ? Math.max(1, Math.min(21, Number(args[weeksArg + 1]) || 4)) : 4;
const cfArg = args.indexOf("--carb-floor");
const CARB_FLOOR = (cfArg >= 0 ? args[cfArg + 1] : "fuel") as "fuel" | "key_range" | "range";
if (!["fuel", "key_range", "range"].includes(CARB_FLOOR)) fail("--carb-floor fuel | key_range | range");
const SUMMARY = args.includes("--summary");

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const env = Object.fromEntries(
  (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "")
    .split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) fail("Run from the repo root; needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const { data: me, error: meErr } = await db.from("profiles").select("id, full_name, timezone").eq("is_admin", true).single();
if (meErr || !me) fail(`Athlete not found: ${meErr?.message ?? ""}`);
const ATHLETE = me.id as string;
const TZ = (me.timezone as string | null) || "America/Chicago";

// ------------------------------------------------------------------ the goal (from Eli's message, 2026-11-14)
const kg = (lb: number) => Math.round(lb * LB * 100) / 100;
const goalRow = {
  athlete_id: ATHLETE,
  height_cm: 175.3, // 69 in
  age_years: 26,
  age_on: "2026-11-14",
  sex: "male",
  activity_factor: 1.4,
  start_date: "2026-11-16",
  start_kg: kg(178),
  target_kg: kg(165),
  target_date: "2027-04-04",
  original_date: "2027-04-04",
  latest_date: "2027-04-18",
  maintain_until: "2027-05-08",
  line: [
    { date: "2026-11-16", kg: kg(178) },
    { date: "2027-01-04", kg: kg(173) },
    { date: "2027-03-01", kg: kg(168) },
    { date: "2027-04-04", kg: kg(165) },
  ],
  max_rate_lb_wk: 1.0,
  easy_deficit: 500,
  moderate_deficit: 400,
  carb_floor: CARB_FLOOR,
  key_deficit: 400,
  pre_big_deficit: 300,
  big_deficit: 300,
  hold_band_lb: 2,
  active: true,
};
const weighRow = { athlete_id: ATHLETE, date: "2026-11-14", weight_kg: kg(178), source: "manual" };

console.log(`${DRY ? "DRY RUN (nothing is written)" : "APPLY"} · athlete ${me.full_name} (${ATHLETE}) · ${TZ}\n`);

// What's there now (tables may not exist before the migration).
const existingGoal = await db.from("weight_goals").select("id, target_date, active").eq("athlete_id", ATHLETE).eq("active", true).maybeSingle();
const existingWeigh = await db.from("body_weights").select("date, weight_kg").eq("athlete_id", ATHLETE).eq("date", weighRow.date).maybeSingle();
const migrated = !existingGoal.error && !existingWeigh.error;
console.log(`Migration applied: ${migrated ? "yes" : `no (${existingGoal.error?.message ?? existingWeigh.error?.message})`}`);
if (migrated) {
  console.log(`Active goal now: ${existingGoal.data ? `${existingGoal.data.id} (target ${existingGoal.data.target_date})` : "none"}`);
  console.log(`Weigh-in on ${weighRow.date} now: ${existingWeigh.data ? `${existingWeigh.data.weight_kg} kg` : "none"}`);
}
console.log(`\nWould ${existingGoal.data ? "SKIP (an active goal exists)" : "INSERT"} weight_goals:`);
console.log(JSON.stringify({ ...goalRow, athlete_id: "…" }, null, 1));
console.log(`\nWould ${existingWeigh.data ? "UPDATE" : "INSERT"} body_weights: ${weighRow.date} = ${weighRow.weight_kg} kg (178.0 lb)\n`);

// ------------------------------------------------------------------ preview: the next WEEKS weeks from the real plan
const plannedAt = (d: string) => plannedKg(goalRow.line, d);
const goal: Goal = { id: "preview", ...goalRow, sex: "male", carb_floor: CARB_FLOOR };
const from = mondayOf(goalRow.start_date);
const days = WEEKS * 7;
const to = addDays(from, days);
const [{ data: plans, error: pErr }, { data: zones }] = await Promise.all([
  db
    .from("planned_workouts")
    .select("id, scheduled_date, sport, title, steps, brick, test_kind, plan_meta, start_time, pool_unit")
    .eq("athlete_id", ATHLETE)
    .is("deleted_at", null)
    .not("status", "in", "(draft,skipped)")
    .gte("scheduled_date", from)
    .lte("scheduled_date", to)
    .order("scheduled_date"),
  db.from("athlete_zones").select("ftp_w, threshold_speed_mps").eq("athlete_id", ATHLETE).maybeSingle(),
]);
if (pErr) fail(pErr.message);
const z: { ftp_w?: number | null; threshold_speed_mps?: number | null } = zones ?? {};
const W = goalRow.start_kg;
const week: Week = { baseline_kcal: estimatedBaseline(W, goal, from), baseline_source: "estimate", easy_deficit: 500, moderate_deficit: 400, pause_until: null, pause_reason: null, target_date: goal.target_date };
type Row = PlannedSession & { scheduled_date: string; pool_unit: string | null };
const sessions = (date: string) =>
  ((plans ?? []) as Row[])
    .filter((p) => p.scheduled_date === date)
    .map((p) => {
      const steps = (p.steps ?? []) as Step[];
      const main = plannedEnergy(p.sport, steps, z, W, p.plan_meta?.planned_duration_min ?? 45, p.pool_unit === "YARD");
      const brick = p.brick ? plannedEnergy("run", p.brick.steps, z, W, 15) : null;
      const energy = brick ? { ...main, minutes: main.minutes + brick.minutes, kcal: main.kcal + brick.kcal, aboveZ2: main.aboveZ2 || brick.aboveZ2 } : main;
      return { ...p, energy, key: isKey(p, energy.minutes, p.sport !== "strength" && isKeySession(p.title, steps, p.sport) && keyWithoutPlan(energy)) };
    });

console.log(`Preview · FTP ${z.ftp_w ?? "?"} W · weight 178 lb · baseline ${week.baseline_kcal} kcal (Mifflin ${Math.round(week.baseline_kcal / 1.4)} × 1.4)`);
console.log("Planned sessions only (no completed data); deficits as they'd be applied.\n");
let total = 0;
for (let w = 0; w < WEEKS; w++) {
  const inputs: DayInput[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(from, w * 7 + i);
    return { date, weightKg: W, goal, week, planned: sessions(date), done: [], tomorrowKey: sessions(addDays(date, 1)).some((s) => s.key),
      tomorrowBig: sessions(addDays(date, 1)).some((s) => isBig(s, s.energy.minutes)), todayBig: sessions(date).some((s) => isBig(s, s.energy.minutes)), todayTest: sessions(date).some(isTest), tomorrowTest: sessions(addDays(date, 1)).some(isTest), goalReached: false };
  });
  const r = planWeekTargets(inputs);
  total += r.deficit;
  const keyDays = r.days.filter((d) => d.type === "key");
  console.log(`Week of ${inputs[0].date}: need ${r.need}, net deficit ${r.deficit} kcal ≈ ${(r.deficit / 3500).toFixed(2)} lb${r.short ? "  (short of 2,000: accepted)" : ""} · key days ${keyDays.length}, carbs ${keyDays.length ? Math.round(Math.min(...keyDays.map((d) => d.carbs)) / W * 10) / 10 : "-"}–${keyDays.length ? Math.round(Math.max(...keyDays.map((d) => d.carbs)) / W * 10) / 10 : "-"} g/kg`);
  if (SUMMARY) continue;
  console.log("  day        type      kcal   P/C/F g          train  def  sessions");
  for (const [i, d] of r.days.entries()) {
    const s = inputs[i].planned.map((p) => `${p.key ? "*" : ""}${p.title.slice(0, 34)} (${p.energy.minutes}′, ${p.energy.kcal})`).join("; ") || "—";
    console.log(
      `  ${new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).padEnd(11)}${d.type.padEnd(10)}${String(d.kcal).padStart(5)}  ${`${d.protein}/${d.carbs}/${d.fat}`.padEnd(15)}${String(d.training).padStart(6)}${String(d.deficit).padStart(5)}  ${s}`,
    );
    console.log(`  ${"".padEnd(11)}${d.reason}`);
  }
  console.log("");
}
console.log(`${WEEKS} weeks (carb floor: ${CARB_FLOOR}, tiers 500/400/400/300/300/0): net deficit ${total} kcal ≈ ${(total / 3500).toFixed(1)} lb. The planned line drops ${((goalRow.start_kg - plannedAt(addDays(from, days))) / LB).toFixed(1)} lb over the same span. * = key session.`);

if (DRY) {
  console.log("\nDry run: nothing written.");
  process.exit(0);
}
if (!migrated) fail("Apply the migration first.");
if (!existingGoal.data) {
  const { error } = await db.from("weight_goals").insert(goalRow);
  if (error) fail(`Goal insert failed: ${error.message}`);
  console.log("Inserted weight_goals.");
}
const { error: wErr } = await db.from("body_weights").upsert(weighRow);
if (wErr) fail(`Weigh-in failed: ${wErr.message}`);
console.log("Saved body_weights 2026-11-14.");

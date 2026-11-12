// Weakness bosses on the server: measure an athlete's limiters from their own workouts, suggest one
// for the coach, and settle damage. Uses the admin client; callers check who may see what.
import type { SupabaseClient } from "@supabase/supabase-js";

import { BOSS, BOSS_HP, bonusDamage, candidates, DEFEAT_GRIT, healthLeft, HIT_PLANNED, HIT_TAGGED, monthOf, pickLimiter, type Limiter, type PickInput } from "@/lib/bosses/bosses";
import { getSwimView } from "@/lib/swim/data";

const DAY = 86_400_000;
const isRun = (s: string | null) => /run|treadmill|trail|track/i.test(s ?? "");
const isRide = (s: string | null) => /cycl|bik|ride|spin/i.test(s ?? "");
const isSwim = (s: string | null) => /swim/i.test(s ?? "");
const family = (s: string | null) => (isSwim(s) ? "swim" : isRun(s) ? "run" : isRide(s) ? "bike" : "other");
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clean = (xs: unknown) => (Array.isArray(xs) ? xs : []).map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));

/** First third vs last third of a stream's positive values. */
export function thirds(xs: (number | null)[]): { first: number; last: number } | null {
  const v = xs.filter((x): x is number => x != null && x > 0);
  if (v.length < 60) return null;
  const n = Math.floor(v.length / 3);
  return { first: mean(v.slice(0, n)), last: mean(v.slice(-n)) };
}

/** Power on climbs (grade > 3%) over power on the flat (|grade| < 1%), from altitude + distance. */
export function climbRatio(alt: (number | null)[], dist: (number | null)[], power: (number | null)[]): number | null {
  const up: number[] = [];
  const flat: number[] = [];
  const W = 10;
  for (let i = W; i < power.length; i++) {
    const p = power[i], a1 = alt[i], a0 = alt[i - W], d1 = dist[i], d0 = dist[i - W];
    if (p == null || p <= 0 || a1 == null || a0 == null || d1 == null || d0 == null || d1 - d0 < 20) continue;
    const g = ((a1 - a0) / (d1 - d0)) * 100;
    if (g > 3) up.push(p);
    else if (Math.abs(g) < 1) flat.push(p);
  }
  return up.length >= 60 && flat.length >= 60 ? mean(up) / mean(flat) : null;
}

/** Everything the limiter rules need, from a date range of the athlete's own data. */
export async function measure(admin: SupabaseClient, athleteId: string, sinceIso: string, untilIso = new Date().toISOString()): Promise<PickInput> {
  const [{ data: acts }, { data: plans }] = await Promise.all([
    admin.from("activities").select("id, sport, start_time, duration_s, planned_workout_id").eq("athlete_id", athleteId).gte("start_time", sinceIso).lt("start_time", untilIso).order("start_time", { ascending: false }).limit(400),
    admin.from("planned_workouts").select("id, scheduled_date, sport, status").eq("athlete_id", athleteId).is("deleted_at", null).in("status", ["approved", "sent", "completed", "skipped"]).gte("scheduled_date", sinceIso.slice(0, 10)).lt("scheduled_date", untilIso.slice(0, 10)),
  ]);
  const list = acts ?? [];
  const longOnes = list.filter((a) => (isRun(a.sport) || isRide(a.sport)) && (a.duration_s ?? 0) >= 75 * 60).slice(0, 10);
  const rides = list.filter((a) => isRide(a.sport) && (a.duration_s ?? 0) >= 40 * 60).slice(0, 12);
  const ids = [...new Set([...longOnes, ...rides].map((a) => a.id))];
  const { data: details } = ids.length ? await admin.from("activity_details").select("activity_id, speed:streams->speed, power:streams->power, alt:streams->alt, dist:streams->dist").in("activity_id", ids) : { data: [] };
  const byId = new Map((details ?? []).map((d) => [d.activity_id as string, d as Record<string, unknown>]));

  const long: { first: number; last: number }[] = [];
  for (const a of longOnes) {
    const d = byId.get(a.id);
    if (!d) continue;
    const power = clean(d.power);
    const t = isRide(a.sport) && power.some((p) => p && p > 0) ? thirds(power) : thirds(clean(d.speed));
    if (t) long.push(t);
  }
  const climbs: number[] = [];
  for (const a of rides) {
    const d = byId.get(a.id);
    if (!d) continue;
    const r = climbRatio(clean(d.alt), clean(d.dist), clean(d.power));
    if (r) climbs.push(r);
  }
  const swimView = await getSwimView(admin, athleteId).catch(() => null);
  const swims = (swimView?.metrics ?? []).filter((m) => m.date >= sinceIso.slice(0, 10) && m.date < untilIso.slice(0, 10)).map((m) => m.swolf25);
  const sessions = list.filter((a) => (a.duration_s ?? 0) >= 600);
  const swimShare = sessions.length ? sessions.filter((a) => isSwim(a.sport)).length / sessions.length : 0;

  const done = (p: { id: string; scheduled_date: string; sport: string | null }) =>
    list.some((a) => a.planned_workout_id === p.id || (String(a.start_time).slice(0, 10) === p.scheduled_date && family(a.sport) === family(p.sport)));
  const past = (plans ?? []).filter((p) => p.status !== "skipped");
  return { long, climbs, swims, swimShare, planned: past.length, done: past.filter(done).length };
}

export const valueFor = (limiter: Limiter, input: PickInput) => candidates(input).find((c) => c.limiter === limiter) ?? null;

/** Suggest this month's boss for one athlete (skips if there already is one). Returns the limiter or null. */
export async function suggestBoss(admin: SupabaseClient, athleteId: string, coachId: string, today: string): Promise<Limiter | null> {
  const month = monthOf(today);
  const { data: existing } = await admin.from("bosses").select("id").eq("athlete_id", athleteId).eq("month", month).maybeSingle();
  if (existing) return null;
  const input = await measure(admin, athleteId, new Date(Date.parse(`${today}T12:00:00Z`) - 56 * DAY).toISOString());
  const pick = pickLimiter(input);
  if (!pick) return null;
  const { error } = await admin.from("bosses").insert({ athlete_id: athleteId, coach_id: coachId, month, limiter: pick.limiter, status: "suggested", evidence: pick.line.slice(0, 300), baseline: pick.value, hp: BOSS_HP });
  return error ? null : pick.limiter;
}

type BossRow = { id: string; athlete_id: string; limiter: Limiter; baseline: number | null; hp: number; approved_at: string | null; month: string };

/**
 * Damage for this month's active boss: finished sessions the coach tagged (any planned session for
 * Snoozlet), plus bonus damage when `remeasure` (the daily cron) finds the number has improved.
 */
export async function settleBoss(admin: SupabaseClient, athleteId: string, remeasure = false): Promise<void> {
  const { data: boss } = await admin.from("bosses").select("id, athlete_id, limiter, baseline, hp, approved_at, month").eq("athlete_id", athleteId).eq("status", "active").order("month", { ascending: false }).limit(1).maybeSingle();
  const b = boss as BossRow | null;
  if (!b?.approved_at) return;
  const since = b.approved_at.slice(0, 10);
  let plansQ = admin.from("planned_workouts").select("id, scheduled_date, sport, title").eq("athlete_id", athleteId).is("deleted_at", null).in("status", ["approved", "sent", "completed"]).gte("scheduled_date", since);
  if (b.limiter !== "consistency") plansQ = plansQ.eq("targets_boss", true);
  const [{ data: plans }, { data: acts }] = await Promise.all([
    plansQ,
    admin.from("activities").select("id, sport, start_time, duration_s, planned_workout_id").eq("athlete_id", athleteId).gte("start_time", `${since}T00:00:00Z`),
  ]);
  const hits: { boss_id: string; kind: "session"; ref: string; amount: number; label: string }[] = [];
  for (const p of plans ?? []) {
    const done = (acts ?? []).some((a) => (a.duration_s ?? 0) >= 600 && (a.planned_workout_id === p.id || (String(a.start_time).slice(0, 10) === p.scheduled_date && family(a.sport) === family(p.sport))));
    if (done) hits.push({ boss_id: b.id, kind: "session", ref: p.id, amount: b.limiter === "consistency" ? HIT_PLANNED : HIT_TAGGED, label: String(p.title ?? "Session").slice(0, 120) });
  }
  if (hits.length) await admin.from("boss_hits").upsert(hits, { onConflict: "boss_id,kind,ref", ignoreDuplicates: true });

  if (remeasure) {
    const input = await measure(admin, athleteId, b.approved_at);
    const now = valueFor(b.limiter, input)?.value ?? null;
    const bonus = bonusDamage(b.limiter, b.baseline == null ? null : Number(b.baseline), now);
    if (now != null) await admin.from("bosses").update({ current: now }).eq("id", b.id);
    const { data: prev } = await admin.from("boss_hits").select("amount").eq("boss_id", b.id).eq("kind", "bonus").eq("ref", "improvement").maybeSingle();
    if (bonus > (prev?.amount ?? 0)) await admin.from("boss_hits").upsert({ boss_id: b.id, kind: "bonus", ref: "improvement", amount: bonus, label: "Measurable improvement" }, { onConflict: "boss_id,kind,ref" });
  }

  const { data: all } = await admin.from("boss_hits").select("amount").eq("boss_id", b.id);
  if (healthLeft(b.hp, all ?? []) > 0) return;
  // Defeated: badge (the boss row itself), grit, and the boss-only gear.
  const { data: won } = await admin.from("bosses").update({ status: "defeated", defeated_at: new Date().toISOString() }).eq("id", b.id).eq("status", "active").select("id");
  if (!won?.length) return;
  const meta = BOSS[b.limiter];
  await admin.from("grit_ledger").upsert({ athlete_id: athleteId, kind: "boss", ref: b.id, amount: DEFEAT_GRIT, reason: `Defeated ${meta.name}`, detail: { day: new Date().toISOString().slice(0, 10) } }, { onConflict: "athlete_id,kind,ref", ignoreDuplicates: true });
  await admin.from("grit_items").upsert({ athlete_id: athleteId, item_id: meta.reward, qty: 1 }, { onConflict: "athlete_id,item_id", ignoreDuplicates: true });
  await admin.rpc("server_notify", { p_user: athleteId, p_kind: "boss", p_title: `You beat ${meta.name}! 🏆`, p_body: "A badge, 100 grit and boss-only gear are yours.", p_href: "/account", p_key: `boss_defeated:${b.id}` });
}

/** Monthly: last month's unbeaten bosses wander off, and new suggestions go to each coach. */
export async function runMonthlyBosses(admin: SupabaseClient) {
  const today = new Date().toISOString().slice(0, 10);
  if (!today.endsWith("-01")) return { status: "skipped" };
  await admin.from("bosses").update({ status: "escaped" }).eq("status", "active").lt("month", monthOf(today));
  await admin.from("bosses").update({ status: "skipped" }).eq("status", "suggested").lt("month", monthOf(today));
  const { data: coaches } = await admin.from("profiles").select("id").eq("role", "coach");
  let suggested = 0;
  for (const c of coaches ?? []) {
    const { data: roster } = await admin.from("profiles").select("id").eq("coach_id", c.id).eq("is_test", false);
    let n = 0;
    for (const a of roster ?? []) if (await suggestBoss(admin, a.id, c.id, today).catch(() => null)) n++;
    if (n) await admin.rpc("server_notify", { p_user: c.id, p_kind: "boss_suggested", p_title: `This month's bosses: ${n} to review`, p_body: "Approve, swap or skip each one on Today. Athletes see nothing until you do.", p_href: "/dashboard#bosses", p_key: `bosses:${today}` });
    suggested += n;
  }
  return { suggested };
}

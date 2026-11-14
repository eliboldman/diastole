import "server-only";

// Sunday-evening review for self-coached plan athletes: the week planned vs done, missed key sessions,
// readiness and HRV, current zones against the plan's projection, checkpoint results, and next week.
// Rules only. Emailed (Resend) and linked from a bell notification.

import { getWeightView } from "@/lib/fuel/weight-data";
import { LB, addDays as addD, plannedKg, shiftedLine } from "@/lib/fuel/weight-plan";
import type { createAdminClient } from "@/lib/supabase/server";
import { isKeySession } from "@/lib/training/alerts";
import { addDays, mondayOf } from "@/lib/training/week";
import { getWeek } from "@/lib/training/week-data";
import type { Step } from "@/lib/workouts/garmin-format";

import { CHECKPOINTS, PCB_PLAN_ID, fitnessFromZones, fmtClock, metricText, planWeek, projectedAt, raceEstimate, type Fitness, type MetricKey } from "./plan";
import { localToday, planAthletes } from "./server";

type Admin = ReturnType<typeof createAdminClient>;
const BASE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://diastole.app").replace(/\/$/, "");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const hrs = (s: number) => `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`;
const LABEL: Record<string, string> = { swim: "Swim", bike: "Bike", run: "Run", strength: "Strength", other: "Other" };

type Status = "ahead" | "on track" | "behind";
function vsProjection(key: keyof Fitness, actual: number, projected: number): Status {
  const r = key === "ftp" ? actual / projected : projected / actual; // >1 is better
  return r >= 1.015 ? "ahead" : r >= 0.985 ? "on track" : "behind";
}

export async function buildReview(admin: Admin, a: { id: string; timezone: string }) {
  const t = localToday(a.timezone);
  const monday = mondayOf(t);
  const week = await getWeek(admin, a.id, a.timezone, monday);
  const next = await getWeek(admin, a.id, a.timezone, addDays(monday, 7));
  const [{ data: rs }, { data: well }, { data: zones }, { data: cps }, { data: decided }] = await Promise.all([
    admin.from("readiness_scores").select("date, overall, details").eq("athlete_id", a.id).gte("date", monday).lte("date", addDays(monday, 6)).order("date"),
    admin.from("daily_wellness").select("date, hrv_ms").eq("athlete_id", a.id).gte("date", addDays(t, -28)).not("hrv_ms", "is", null),
    admin.from("athlete_zones").select("ftp_w, threshold_speed_mps, css_sec_per_100m").eq("athlete_id", a.id).maybeSingle(),
    admin.from("plan_checkpoints").select("checkpoint, results, lane, evaluated_at").eq("athlete_id", a.id).eq("plan_id", PCB_PLAN_ID).gte("evaluated_at", `${monday}T00:00:00Z`),
    admin.from("coach_proposals").select("kind, title, status, choice").eq("athlete_id", a.id).gte("created_at", `${monday}T00:00:00Z`),
  ]);
  const missedKey = week.sessions.filter((s) => (s.status === "missed" || s.status === "short") && isKeySession(s.plan.title, s.plan.steps as Step[], s.plan.sport));
  const colors = { green: 0, yellow: 0, red: 0 } as Record<string, number>;
  for (const r of rs ?? []) if (r.overall in colors) colors[r.overall]++;
  const loadRatio = (rs ?? []).map((r) => (r.details as { load?: { ratio?: number } } | null)?.load?.ratio).filter((x): x is number => typeof x === "number").at(-1) ?? null;
  const hrv = (from: string) => {
    const v = (well ?? []).filter((w) => w.date >= from).map((w) => Number(w.hrv_ms));
    return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null;
  };
  const hrv7 = hrv(addDays(t, -6));
  const hrv28 = hrv(addDays(t, -28));
  const wk = planWeek(t);
  const proj = projectedAt(wk);
  const cur = fitnessFromZones(zones ?? {});
  const zoneRows = (["ftp", "thr", "css"] as const).map((k) => ({
    key: k,
    label: { ftp: "FTP", thr: "Run threshold", css: "Swim CSS" }[k],
    actual: cur[k] ?? null,
    projected: proj[k],
    status: cur[k] ? vsProjection(k, cur[k]!, proj[k]) : null,
    fmt: (v: number) => (k === "ftp" ? `${Math.round(v)} W` : k === "thr" ? `${fmtClock(v)}/mi` : `${fmtClock(v)}/100 yd`),
  }));
  const est = cur.ftp && cur.thr && cur.css ? raceEstimate(cur as Fitness) : null;
  const nextKey = next.sessions.filter((s) => isKeySession(s.plan.title, s.plan.steps as Step[], s.plan.sport)).map((s) => ({ date: s.plan.date, title: s.plan.title }));
  const weight = await weightSummary(admin, a, t);
  return { monday, end: addDays(monday, 6), wk, week, next, missedKey, colors, loadRatio, hrv7, hrv28, zoneRows, est, cps: cps ?? [], decided: decided ?? [], nextKey, weight };
}

/** Race-weight lines for the review (null without an active goal). Reads the row tonight's weight job wrote. */
async function weightSummary(admin: Admin, a: { id: string; timezone: string }, t: string) {
  const v = await getWeightView(admin, a.id, a.timezone);
  if (!v) return null;
  const latest = v.rows.at(-1) ?? null;
  const target = latest?.target_date ?? v.week.target_date;
  const line = shiftedLine(v.goal.line, target);
  const planned = plannedKg(line, t);
  const plannedRate = (plannedKg(line, addD(t, -7)) - planned) / LB;
  return {
    avg: v.avg,
    planned,
    rate: latest?.rate_lb_wk ?? null,
    plannedRate,
    guardrails: latest?.guardrails ?? [],
    maintenance: t > target,
    onTrack: v.projection.onTrack,
    projected: v.projection.date,
    target,
    targetLb: v.goal.target_kg / LB,
    nextDeficit: latest ? { easy: latest.easy_deficit, moderate: latest.moderate_deficit, pause: latest.pause_until } : null,
  };
}

type Review = Awaited<ReturnType<typeof buildReview>>;

export function reviewHeadline(r: Review) {
  const done = `${r.week.done}/${r.week.due} sessions`;
  const missed = r.missedKey.length ? `, ${r.missedKey.length} key missed` : "";
  const proj = r.zoneRows.filter((z) => z.status === "behind").length ? ", behind projection on " + r.zoneRows.filter((z) => z.status === "behind").map((z) => z.label).join(" and ") : "";
  return `${done}${missed}${proj}.`;
}

export function reviewHtml(r: Review, name: string) {
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const row = (cells: string[], head = false) => `<tr>${cells.map((c, i) => `<${head ? "th" : "td"} style="padding:6px 8px;border-bottom:1px solid #e5e5ea;text-align:${i ? "right" : "left"};font-size:14px">${c}</${head ? "th" : "td"}>`).join("")}</tr>`;
  const sports = r.week.sports.filter((s) => s.plannedSec || s.doneSec);
  const color = (s: string | null) => (s === "ahead" ? "#1f8a4c" : s === "behind" ? "#c0392b" : "#555");
  const section = (title: string, inner: string) => `<h2 style="font-size:16px;margin:24px 0 8px">${title}</h2>${inner}`;
  const table = (rows: string) => `<table style="border-collapse:collapse;width:100%">${rows}</table>`;
  const cpHtml = r.cps
    .map((c) => {
      const cp = CHECKPOINTS.find((x) => x.n === c.checkpoint);
      const res = Object.entries(c.results as Record<string, { value: number; lane: string; label: string }>).map(([k, v]) => `${esc(v.label)} ${metricText(k as MetricKey, v.value)} (${v.lane})`).join(" · ");
      return `<p style="font-size:14px"><b>${esc(cp?.label ?? `Checkpoint ${c.checkpoint}`)}: ${c.lane} lane.</b> ${res}</p>`;
    })
    .join("");
  const nextSports = r.next.sports.filter((s) => s.plannedSec);
  return `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1d1d1f;max-width:620px;margin:0 auto;padding:16px">
<p style="color:#6e6e73;font-size:13px;margin:0">Weekly review · plan week ${r.wk} · ${day(r.monday)}–${day(r.end)}</p>
<h1 style="font-size:22px;margin:4px 0 12px">${esc(name)}, ${esc(reviewHeadline(r))}</h1>
${section("This week", table(row(["", "Planned", "Done"], true) + sports.map((s) => row([LABEL[s.family] ?? s.family, hrs(s.plannedSec), hrs(s.doneSec)])).join("")))}
${r.missedKey.length ? `<p style="font-size:14px"><b>Key sessions missed or cut short:</b> ${r.missedKey.map((s) => `${esc(s.plan.title)} (${day(s.plan.date)})`).join(", ")}</p>` : `<p style="font-size:14px">Every key session done.</p>`}
${section("Recovery", `<p style="font-size:14px">Readiness: ${r.colors.green} green · ${r.colors.yellow} yellow · ${r.colors.red} red.${r.loadRatio !== null ? ` Load ${Math.round(r.loadRatio * 100)}% of usual.` : ""}${r.hrv7 && r.hrv28 ? ` HRV ${Math.round(r.hrv7)} ms this week vs ${Math.round(r.hrv28)} ms over 4 weeks (${r.hrv7 >= r.hrv28 ? "+" : ""}${Math.round(((r.hrv7 - r.hrv28) / r.hrv28) * 100)}%).` : ""}</p>`)}
${section("Fitness vs the 3:55 projection", table(row(["", "Now", `Projected wk ${r.wk}`, ""], true) + r.zoneRows.map((z) => row([z.label, z.actual ? z.fmt(z.actual) : "not set", z.fmt(z.projected), `<span style="color:${color(z.status)};font-weight:600">${z.status ?? ""}</span>`])).join("")) + (r.est ? `<p style="font-size:14px">Race-equivalent finish at today's zones: <b>${fmtClock(r.est.total)}</b> (swim ${fmtClock(r.est.swim)}, bike ${fmtClock(r.est.bike)}, run ${fmtClock(r.est.run)} + 3:00).</p>` : "") + `<p style="color:#6e6e73;font-size:12px">Zones only move when you log a test, so "behind" between tests usually just means the next test hasn't happened yet.</p>`)}
${cpHtml ? section("Checkpoints", cpHtml) : ""}
${r.weight ? section("Race weight", weightHtml(r.weight, day)) : ""}
${r.decided.length ? section("Suggestions this week", `<p style="font-size:14px">${r.decided.map((d) => `${esc(d.title)}: ${d.status === "pending" ? "waiting" : d.status === "approved" ? "applied" : "kept as planned"}`).join("<br>")}</p>`) : ""}
${section("Next week", `<p style="font-size:14px">${nextSports.map((s) => `${LABEL[s.family] ?? s.family} ${hrs(s.plannedSec)}`).join(" · ")}</p>${r.nextKey.length ? `<p style="font-size:14px"><b>Key sessions:</b> ${r.nextKey.map((k) => `${day(k.date)} ${esc(k.title)}`).join(" · ")}</p>` : ""}`)}
<p style="margin-top:24px"><a href="${BASE}/calendar" style="color:#b8460b">Open your calendar</a> · <a href="${BASE}/proposals" style="color:#b8460b">Suggestions</a></p>
</body></html>`;
}

function weightHtml(w: NonNullable<Review["weight"]>, day: (d: string) => string) {
  const lb = (kg: number | null) => (kg === null ? "no trend yet" : `${(kg / LB).toFixed(1)} lb`);
  if (w.maintenance) return `<p style="font-size:14px">Maintenance block: 7-day average ${lb(w.avg)}. No deficit through race day.</p>`;
  const status = w.avg === null ? "Weigh in most mornings so the trend can start." : w.onTrack ? `On track for ${Math.round(w.targetLb)} lb by ${day(w.target)}.` : `Behind the line${w.projected ? `; projected ${day(w.projected)}` : ""}.`;
  const rails = w.guardrails.length ? w.guardrails.map((g) => esc(g.message)).join("<br>") : "No guardrails fired.";
  return `<p style="font-size:14px">7-day average <b>${lb(w.avg)}</b> vs planned ${lb(w.planned)}. Rate ${w.rate === null ? "—" : `${Number(w.rate).toFixed(2)} lb/wk`} vs planned ${Math.max(0, w.plannedRate).toFixed(2)}. ${status}</p><p style="font-size:14px">${rails}</p>${w.nextDeficit ? `<p style="color:#6e6e73;font-size:12px">Next week: ${w.nextDeficit.easy} kcal deficit on easy/rest days, ${w.nextDeficit.moderate} on moderate days, smaller amounts on key and long-session days, 0 on test days and the day before.${w.nextDeficit.pause ? ` Paused until ${day(w.nextDeficit.pause)}.` : ""}</p>` : ""}`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return "no RESEND_API_KEY";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Diastole <hello@diastole.app>", to: [to], subject, html }),
  });
  return res.ok ? "sent" : `resend ${res.status}: ${(await res.text()).slice(0, 200)}`;
}

/** Sunday evening (athlete's time): build, email and notify. */
export async function runWeeklyReviews(admin: Admin, opts: { force?: boolean } = {}) {
  const out: Record<string, unknown> = {};
  for (const a of await planAthletes(admin, true)) {
    const isSunday = new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: a.timezone }) === "Sun";
    if (!isSunday && !opts.force) continue;
    try {
      const r = await buildReview(admin, a);
      const first = (a.full_name ?? "").split(" ")[0] || "Hi";
      const email = a.email ? await sendEmail(a.email, `Week ${r.wk} review: ${reviewHeadline(r)}`, reviewHtml(r, first)) : "no email";
      await admin.rpc("server_notify", { p_user: a.id, p_kind: "autocoach", p_title: `Week ${r.wk} review`, p_body: reviewHeadline(r), p_href: "/calendar", p_key: `review:${a.id}:${r.monday}` });
      out[a.id] = { email };
    } catch (e) {
      out[a.id] = { error: String(e).slice(0, 200) };
    }
  }
  return out;
}

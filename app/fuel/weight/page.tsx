import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import EnergyCheckin from "@/components/fuel/EnergyCheckin";
import { fmt } from "@/components/fuel/WeightGoalCard";
import WeightForm from "@/components/fuel/WeightForm";
import DashboardShell from "@/components/layout/DashboardShell";
import { getWeightView } from "@/lib/fuel/weight-data";
import { DAY_LABEL, LB, addDays, avg7, daysBetween, plannedKg, shiftedLine } from "@/lib/fuel/weight-plan";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Race weight · Diastole" };

const lb = (kg: number | null) => (kg === null ? "—" : (kg / LB).toFixed(1));
const RULE: Record<string, string> = { fast_loss: "Too fast", stall: "Stalled", behind: "Behind", performance: "Power", recovery: "Recovery", low_energy: "Low energy" };

/** Race-weight goal: 7-day average vs the planned line, this week's targets, guardrails, and the check-in. */
export default async function WeightPage() {
  const me = await requireUser();
  const view = await getWeightView(await createClient(), me.id, me.timezone);
  if (!view) redirect("/fuel");
  const { goal, today, weighs, rows, week, weekTargets, projection: p } = view;
  const line = shiftedLine(goal.line, week.target_date);
  const avgNow = view.avg;
  const plannedNow = plannedKg(line, today);
  const plannedRate = (plannedKg(line, addDays(today, -7)) - plannedNow) / LB;
  const latest = rows.at(-1);
  const maintenance = today > week.target_date;

  // ---- chart: planned line, 7-day average, weigh-ins
  const x0 = addDays(goal.start_date, -7);
  const x1 = goal.maintain_until;
  const span = daysBetween(x0, x1);
  const lbs = [...weighs.map((w) => w.kg), ...line.map((l) => l.kg)].map((k) => k / LB);
  const yMax = Math.ceil(Math.max(...lbs, goal.start_kg / LB) + 1);
  const yMin = Math.floor(Math.min(...lbs, goal.target_kg / LB) - 2);
  const W = 640;
  const H = 220;
  const X = (d: string) => (daysBetween(x0, d) / span) * W;
  const Y = (kg: number) => ((yMax - kg / LB) / (yMax - yMin)) * H;
  const planPts = [{ date: x0, kg: line[0].kg }, ...line, { date: x1, kg: line.at(-1)!.kg }].map((q) => `${X(q.date).toFixed(1)},${Y(q.kg).toFixed(1)}`).join(" ");
  const avgPts = weighs
    .map((w) => ({ date: w.date, a: avg7(weighs, w.date) }))
    .filter((q): q is { date: string; a: number } => q.a !== null && q.date >= x0)
    .map((q) => `${X(q.date).toFixed(1)},${Y(q.a).toFixed(1)}`)
    .join(" ");
  const ticks = Array.from({ length: yMax - yMin + 1 }, (_, i) => yMin + i).filter((v) => v % 5 === 0);

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <Link href="/fuel" className="text-sm text-white/50 hover:text-white/80">
        ← Fuel
      </Link>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Race weight</h1>
      <p className="mt-2 text-sm text-white/55">
        {Math.round(goal.start_kg / LB)} → {Math.round(goal.target_kg / LB)} lb by {fmt(week.target_date)}, then maintenance to race day ({fmt(goal.maintain_until)}). Watts and recovery come first.
      </p>

      <section className="row-in mt-6 grid gap-3 sm:grid-cols-4">
        {[
          ["7-day average", `${lb(avgNow)} lb`],
          ["Planned today", `${lb(plannedNow)} lb`],
          ["Rate (2 wk)", latest?.rate_lb_wk !== undefined && latest?.rate_lb_wk !== null ? `${Number(latest.rate_lb_wk).toFixed(2)} lb/wk` : "—", `planned ${Math.max(0, plannedRate).toFixed(2)}`],
          [maintenance ? "Block" : "Goal date", maintenance ? "Maintenance" : p.onTrack ? `On track · ${fmt(week.target_date)}` : p.date ? `Projected ${fmt(p.date)}` : "Behind"],
        ].map(([k, v, sub]) => (
          <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-white/45">{k}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{v}</p>
            {sub && <p className="text-xs text-white/45">{sub}</p>}
          </div>
        ))}
      </section>

      <section className="row-in mt-4 rounded-[28px] border border-white/10 bg-white/[0.06] p-5">
        <svg viewBox={`-34 -8 ${W + 44} ${H + 30}`} className="w-full" role="img" aria-label="7-day average weight against the planned line">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={0} x2={W} y1={((yMax - v) / (yMax - yMin)) * H} y2={((yMax - v) / (yMax - yMin)) * H} stroke="currentColor" className="text-white/10" />
              <text x={-6} y={((yMax - v) / (yMax - yMin)) * H + 4} textAnchor="end" fontSize={11} className="fill-white/45">
                {v}
              </text>
            </g>
          ))}
          <line x1={X(today)} x2={X(today)} y1={0} y2={H} stroke="currentColor" className="text-white/20" strokeDasharray="2 4" />
          <polyline points={planPts} fill="none" stroke="currentColor" className="text-white/40" strokeWidth={2} strokeDasharray="6 5" />
          {weighs.filter((w) => w.date >= x0).map((w) => (
            <circle key={w.date} cx={X(w.date)} cy={Y(w.kg)} r={2} className="fill-white/25" />
          ))}
          {avgPts && <polyline points={avgPts} fill="none" stroke="currentColor" className="text-emerald-300" strokeWidth={2.5} />}
          {[goal.start_date, week.target_date, goal.maintain_until].map((d) => (
            <text key={d} x={X(d)} y={H + 20} textAnchor="middle" fontSize={11} className="fill-white/45">
              {fmt(d)}
            </text>
          ))}
        </svg>
        <p className="mt-2 text-xs text-white/45">
          <span className="text-emerald-300">━</span> 7-day average · <span className="text-white/50">┅</span> planned line · dots are single weigh-ins (not used on their own)
        </p>
        <div className="mt-4 border-t border-white/[0.08] pt-4">
          <WeightForm weightKg={weighs.find((w) => w.date === today)?.kg ?? weighs.at(-1)?.kg ?? goal.start_kg} unit={me.units === "km" ? "kg" : "lb"} />
        </div>
      </section>

      <section className="row-in mt-4 rounded-[28px] border border-white/10 bg-white/[0.06] p-5">
        <h2 className="text-lg font-medium">This week</h2>
        <p className="mt-1 text-sm text-white/55">
          Deficit {weekTargets.deficit.toLocaleString()} kcal{weekTargets.short && !maintenance ? ` (the line needs ${weekTargets.need.toLocaleString()}: a test or long-session-heavy week, so a smaller loss; tests and the day before stay at maintenance)` : ""}. Baseline{" "}
          {week.baseline_kcal.toLocaleString()} kcal ({week.baseline_source === "measured" ? "measured from your trend and logs" : "estimated; measured once there are 14 fully logged days"}).
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-[0.12em] text-white/45">
              <tr>
                <th className="py-2 font-normal">Day</th>
                <th className="font-normal">Type</th>
                <th className="text-right font-normal">kcal</th>
                <th className="text-right font-normal">P / C / F g</th>
                <th className="text-right font-normal">Training</th>
                <th className="text-right font-normal">Deficit</th>
              </tr>
            </thead>
            <tbody>
              {weekTargets.days.map((d) => (
                <tr key={d.date} className={`border-t border-white/[0.06] ${d.date === today ? "text-white" : "text-white/70"}`} title={d.reason}>
                  <td className="py-2">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" })}</td>
                  <td>{DAY_LABEL[d.type]}</td>
                  <td className="text-right tabular-nums">{d.kcal.toLocaleString()}</td>
                  <td className="text-right tabular-nums">
                    {d.protein} / {d.carbs} / {d.fat}
                  </td>
                  <td className="text-right tabular-nums">{d.training.toLocaleString()}</td>
                  <td className="text-right tabular-nums">{d.deficit || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 space-y-1 text-xs text-white/50">
          {weekTargets.days.map((d) => (
            <li key={d.date}>
              {new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}: {d.reason}
            </li>
          ))}
        </ul>
        {week.pause_until && week.pause_until >= today && <p className="mt-3 rounded-2xl border border-amber-200/20 bg-amber-200/[0.06] px-4 py-3 text-sm text-amber-50/90">Deficit paused until {fmt(week.pause_until)}: {week.pause_reason}</p>}
      </section>

      <section className="row-in mt-4 rounded-[28px] border border-white/10 bg-white/[0.06] p-5">
        <h2 className="text-lg font-medium">Week by week</h2>
        {rows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.12em] text-white/45">
                <tr>
                  <th className="py-2 font-normal">Week of</th>
                  <th className="text-right font-normal">7-day avg</th>
                  <th className="text-right font-normal">Planned</th>
                  <th className="text-right font-normal">Rate</th>
                  <th className="font-normal">&nbsp;Guardrails</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.week_start} className="border-t border-white/[0.06] text-white/75">
                    <td className="py-2">{fmt(r.week_start)}</td>
                    <td className="text-right tabular-nums">{lb(r.avg_kg)}</td>
                    <td className="text-right tabular-nums">{lb(r.planned_kg)}</td>
                    <td className="text-right tabular-nums">{r.rate_lb_wk === null ? "—" : `${Number(r.rate_lb_wk).toFixed(2)}`}</td>
                    <td className="pl-3 text-xs text-white/55">{r.guardrails.length ? r.guardrails.map((g) => <span key={g.rule} className="block" title={g.message}>{RULE[g.rule] ?? g.rule}: {g.message}</span>) : "none"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-white/55">The first weekly check runs Sunday evening.</p>
        )}
      </section>

      <section id="checkin" className="row-in mt-4 scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-5">
        <h2 className="text-lg font-medium">Weekly energy check-in</h2>
        <p className="mt-1 mb-4 text-sm text-white/55">Tick any that fit this week. Two or more, or the same one two weeks running, turns the deficit off. Only you and your coach see this.</p>
        <EnergyCheckin done={view.checkedIn} />
      </section>

      <p className="mt-6 text-xs text-white/40">
        Training-nutrition recommendations from your plan&apos;s rules, not medical advice. If energy, sleep, mood or health feel off, talk to a doctor or sports dietitian.
      </p>
    </DashboardShell>
  );
}

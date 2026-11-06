import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { LEVEL_STYLE, sessionLength } from "@/components/fuel/levels";
import Plate from "@/components/fuel/Plate";
import SessionFuel from "@/components/fuel/SessionFuel";
import { sportLabel } from "@/lib/activity/format";
import type { FuelDayView } from "@/lib/fuel/data";
import { dayReason, eveTip, FUEL_DAYS, FUEL_DISCLAIMER, type FuelMode } from "@/lib/fuel/plan";

const weekday = (iso: string, long = false) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", long ? { weekday: "long", month: "short", day: "numeric" } : { weekday: "short" });

function Sessions({ day, mode }: { day: FuelDayView; mode: FuelMode }) {
  return (
    <div className="space-y-6">
      {day.workouts.map((w, i) => (
        <div key={w.id}>
          <Link href={`/training/workouts/${w.id}`} className="group flex min-h-11 items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate font-medium">{w.title}</span>
              <span className="text-xs text-white/50">{[sportLabel(w.sport), sessionLength(w.session), w.session.hard ? "includes hard efforts" : null].filter(Boolean).join(" · ")}</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-white/40 transition group-hover:text-emerald-200" aria-hidden />
          </Link>
          <div className="mt-3">
            <SessionFuel session={w.session} mode={mode} laterToday={i < day.workouts.length - 1} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The Fuel page body: today's fuel level and plate, fueling around sessions, and the week. */
export default function FuelView({ mode, days, log }: { mode: FuelMode; days: FuelDayView[]; log?: ReactNode }) {
  const [day, tomorrow] = days;
  const next = day.workouts.length ? null : days.slice(1).find((d) => d.workouts.length);
  const level = FUEL_DAYS[day.level];
  const eve = tomorrow ? eveTip(tomorrow.level, tomorrow.workouts.map((w) => w.session)) : null;
  const words = (x: { plain: string; numbers: string }) => (mode === "full" ? x.numbers : x.plain);

  return (
    <>
      <h1 className="text-4xl font-bold tracking-tight">Fuel</h1>
      <p className="mt-2 text-sm text-white/55">Food follows training: what to eat around today&rsquo;s sessions.</p>

      {log}

      {mode !== "workout" && (
        <section className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-sm font-medium ${LEVEL_STYLE[day.level].pill}`}>{level.label}</span>
            <span className="text-sm text-white/55">{dayReason(day.workouts.map((w) => w.session), day.race)}</span>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
            <Plate plate={level.plate} />
            <p className="text-[15px] leading-relaxed text-white/85">{words(level)}</p>
          </div>
          {eve && <p className="mt-4 rounded-2xl border border-amber-200/15 bg-amber-200/[0.05] px-4 py-3 text-sm text-amber-50/85">{words(eve)}</p>}
        </section>
      )}

      <section id="sessions" className="row-in mt-6 scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6" style={{ animationDelay: "80ms" }}>
        <h2 className="text-lg font-medium">{day.workouts.length ? "Around today's training" : next ? `Next up: ${weekday(next.date, true)}` : "Around your training"}</h2>
        <div className="mt-4">
          {day.workouts.length ? (
            <Sessions day={day} mode={mode} />
          ) : next ? (
            <Sessions day={next} mode={mode} />
          ) : (
            <p className="text-sm text-white/55">No workouts planned this week. Normal meals with some protein and plenty of color are all you need.</p>
          )}
        </div>
      </section>

      {mode !== "workout" && (
        <section id="week" className="row-in mt-6 scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6" style={{ animationDelay: "160ms" }}>
          <h2 className="text-lg font-medium">This week</h2>
          <ol className="mt-4 grid grid-cols-7 gap-1.5">
            {days.map((d, i) => (
              <li key={d.date} className={`flex flex-col items-center gap-2 rounded-2xl border px-1 py-3 text-center ${i === 0 ? "border-white/20 bg-white/[0.07]" : "border-white/[0.07]"}`}>
                <span className="text-[11px] uppercase tracking-wider text-white/55">{i === 0 ? "Today" : weekday(d.date)}</span>
                <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_STYLE[d.level].dot}`} aria-hidden />
                <span className="text-xs text-white/75">{LEVEL_STYLE[d.level].short}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-white/45">Fuel levels follow your planned training and update when your plan changes.</p>
        </section>
      )}

      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-white/45">{FUEL_DISCLAIMER}</p>
    </>
  );
}

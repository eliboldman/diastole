import { Moon } from "lucide-react";

import { minClock, SLACK_MIN } from "@/lib/sleep/bedtime";
import { getConsistency, getSleepSetup } from "@/lib/sleep/data";
import { createClient } from "@/lib/supabase/server";

const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "narrow", timeZone: "UTC" });
const hm = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ""}`;

/** Coach: last 14 nights, target bedtime vs when sleep actually started. */
export default async function BedtimeTrend({ athleteId, timeZone, name }: { athleteId: string; timeZone: string; name: string }) {
  const supabase = await createClient();
  const [{ nights, hit, total }, setup] = await Promise.all([getConsistency(supabase, athleteId, timeZone, 14), getSleepSetup(supabase, athleteId)]);
  const withData = nights.filter((n) => n.sleepStartMin !== null);
  // Scale: earliest target/actual to latest, padded half an hour.
  const vals = nights.flatMap((n) => [n.targetMin, n.sleepStartMin]).filter((v): v is number => v !== null);
  const lo = vals.length ? Math.min(...vals) - 30 : 1260;
  const hi = vals.length ? Math.max(...vals) + 30 : 1440;
  const y = (v: number) => ((v - lo) / Math.max(1, hi - lo)) * 100;

  return (
    <section id="bedtime" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Moon size={18} className="text-emerald-200" aria-hidden /> Bedtime
      </h2>
      <p className="mt-1 text-sm text-white/55">
        {total
          ? `${name} hit their bedtime ${hit} of ${total} nights (within ${SLACK_MIN} min) over the last two weeks.`
          : withData.length
            ? "Sleep start times are coming in; targets appear once training times or a wake time are set."
            : "Sleep start times appear once their watch sends them (Garmin now; Apple Watch with the next app update)."}
        {" "}Goal {hm(setup.goalMin)}{setup.goalFromData ? " (from their sleep)" : ""}, {setup.prefs.buffer_min} min to get ready, nudges {setup.prefs.nudges ? "on" : "off"}.
      </p>
      {vals.length > 0 && (
        <div className="mt-4">
          <div className="relative grid h-36 gap-1" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }} role="img" aria-label={`Target and actual bedtimes, last 14 nights: ${hit} of ${total} on time`}>
            {nights.map((n) => {
              const on = n.targetMin !== null && n.sleepStartMin !== null && n.sleepStartMin <= n.targetMin + SLACK_MIN;
              return (
                <div key={n.date} className="relative" title={`${n.date}: target ${n.targetMin !== null ? minClock(n.targetMin) : "none"}, asleep ${n.sleepStartMin !== null ? minClock(n.sleepStartMin) : "no data"}`}>
                  {n.targetMin !== null && <span className="absolute inset-x-0 h-0.5 rounded bg-white/35" style={{ top: `${y(n.targetMin)}%` }} />}
                  {n.sleepStartMin !== null && (
                    <span className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${on ? "bg-emerald-300" : "bg-amber-200"}`} style={{ top: `${y(n.sleepStartMin)}%` }} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-1 grid text-center text-[10px] text-white/40" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }} aria-hidden>
            {nights.map((n) => (
              <span key={n.date}>{day(n.date)}</span>
            ))}
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-white/35" /> Target bedtime (earlier is higher)</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Asleep on time</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-200" /> Later than target</span>
          </p>
        </div>
      )}
    </section>
  );
}

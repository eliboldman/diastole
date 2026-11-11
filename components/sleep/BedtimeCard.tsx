import { Moon } from "lucide-react";
import Link from "next/link";

import { minClock } from "@/lib/sleep/bedtime";
import { getTonight } from "@/lib/sleep/data";
import { createClient } from "@/lib/supabase/server";
import { clock12 } from "@/lib/week-prefs";

const hm = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ""}`;

/** Today: tonight's bedtime, worked back from tomorrow's first session (or the wake time). */
export default async function BedtimeCard({ athleteId, timeZone }: { athleteId: string; timeZone: string }) {
  const supabase = await createClient();
  const { bedtime, setup } = await getTonight(supabase, athleteId, timeZone);
  const needsSetup = !setup.saved && !Object.values(setup.week).some((d) => d.window);
  if (!bedtime && !needsSetup) return null;
  return (
    <section className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5" style={{ animationDelay: "60ms" }}>
      <div className="flex items-start gap-3">
        <Moon size={20} className="mt-0.5 shrink-0 text-emerald-200" aria-hidden />
        <div className="min-w-0 flex-1">
          {bedtime ? (
            <>
              <p className="text-[11px] uppercase tracking-[0.15em] text-emerald-100/70">Tonight</p>
              <p className="mt-0.5 text-xl font-semibold">Lights out by {minClock(bedtime.bedtimeMin)}</p>
              <p className="mt-1 text-sm text-white/65">
                {bedtime.first
                  ? `${hm(bedtime.goalMin)} of sleep before ${bedtime.first.title} at ${clock12(bedtime.first.start)} tomorrow (with ${setup.prefs.buffer_min} min to get ready).`
                  : `${hm(bedtime.goalMin)} of sleep before your ${clock12(setup.prefs.wake_time ?? "06:00")} wake-up.`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {setup.prefs.wind_down && (
                  <Link href={`/recovery/${setup.prefs.wind_down}?from=/me`} className="flex min-h-10 items-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 text-sm text-emerald-50">
                    Start wind-down
                  </Link>
                )}
                <Link href="/me/setup#sleep" className="flex min-h-10 items-center rounded-xl px-2 text-sm text-white/55 hover:text-white">
                  Sleep settings
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="font-medium">When do you train and sleep?</p>
              <p className="mt-1 text-sm text-white/65">Add your usual training times and wake time, and Today will show a bedtime that gets you the sleep you need before each session.</p>
              <Link href="/me/setup#week" className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 text-sm text-emerald-50">
                Set it up (1 minute)
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

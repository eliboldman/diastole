import type { Metadata } from "next";
import Link from "next/link";

import ClosetEditor from "@/components/ClosetEditor";
import ZonesForm from "@/components/coach/ZonesForm";
import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import WeekPrefsEditor from "@/components/WeekPrefsEditor";
import { paceOf } from "@/lib/activity/format";
import { cleanCloset } from "@/lib/closet";
import { getBikeMileage, getShoeMileage } from "@/lib/shoes";
import { createClient, requireUser } from "@/lib/supabase/server";
import { cleanWeek } from "@/lib/week-prefs";

export const metadata: Metadata = { title: "My setup · Diastole" };

const card = "mt-6 scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 sm:p-6";

/** Everything about you that shapes your plan, in one place: closet and gear, numbers, training days. */
export default async function MySetupPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const [{ data: gearRow }, { data: zones }, { data: week }] = await Promise.all([
    supabase.from("athlete_gear").select("gear").eq("athlete_id", me.id).maybeSingle(),
    supabase.from("athlete_zones").select("max_hr, threshold_speed_mps, ftp_w, threshold_hr").eq("athlete_id", me.id).maybeSingle(),
    supabase.from("athlete_week").select("days").eq("athlete_id", me.id).maybeSingle(),
  ]);
  const closet = cleanCloset(gearRow?.gear);
  const [mileage, bikeMiles] = await Promise.all([getShoeMileage(supabase, me.id, closet, me.timezone), getBikeMileage(supabase, me.id, closet, me.timezone)]);
  const units = me.units === "km" ? "km" : "mi";
  const jump = [
    ["#closet", "Closet and gear"],
    ["#numbers", "My numbers"],
    ["#week", "Training days"],
  ] as const;

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <BackLink href="/account" label="Me" />
      <h1 className="mt-3 text-4xl font-bold tracking-tight">My setup</h1>
      <p className="mt-2 text-white/55">What you own, your numbers and when you train. Your coach plans around all of it.</p>
      <nav aria-label="Sections" className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {jump.map(([href, label]) => (
          <Link key={href} href={href} className="flex min-h-10 shrink-0 items-center rounded-full border border-white/10 px-4 text-sm text-white/70 hover:bg-white/[0.05]">
            {label}
          </Link>
        ))}
      </nav>

      <section id="closet" className={card}>
        <h2 className="text-lg font-medium">Closet and gear</h2>
        <p className="mb-5 mt-1 text-sm text-white/55">Shoes, bikes and what you can use. Each workout shows what to pack, and shoe miles add up on their own.</p>
        <ClosetEditor athleteId={me.id} initial={closet} mileage={mileage} bikeMileage={bikeMiles} units={units} today={today} />
      </section>

      <section id="numbers" className={card}>
        <h2 className="text-lg font-medium">My numbers</h2>
        <p className="mb-4 mt-1 text-sm text-white/55">FTP, threshold pace and heart rates set your zones and workout targets. Update them after a test; your coach sees every change.</p>
        <ZonesForm
          athleteId={me.id}
          maxHr={zones?.max_hr ?? null}
          thresholdPace={zones?.threshold_speed_mps ? paceOf(Number(zones.threshold_speed_mps), units) : null}
          units={units}
          ftp={zones?.ftp_w ?? null}
          thresholdHr={zones?.threshold_hr ?? null}
          estimatedMaxHr={null}
          saveLabel="Save my numbers"
        />
      </section>

      <section id="week" className={card}>
        <h2 className="text-lg font-medium">Training days</h2>
        <p className="mb-4 mt-1 text-sm text-white/55">Which disciplines you like on which days, and how much time you have.</p>
        <WeekPrefsEditor initial={cleanWeek(week?.days)} />
      </section>

    </DashboardShell>
  );
}

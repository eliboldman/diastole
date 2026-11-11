import type { Metadata } from "next";

import DashboardShell from "@/components/layout/DashboardShell";
import GutTraining from "@/components/race/GutTraining";
import RaceForm from "@/components/race/RaceForm";
import RaceList from "@/components/race/RaceList";
import SweatTest from "@/components/race/SweatTest";
import PredictionsCard from "@/components/predict/PredictionsCard";
import Spotlight from "@/components/Spotlight";
import { seen, TIPS } from "@/lib/discovery";
import { getPredictions } from "@/lib/predict/data";
import { getRaces, getRaceTools } from "@/lib/fuel/race-data";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Races · Diastole" };

const card = "rounded-[28px] border border-white/10 bg-white/[0.055] p-6";

/** Races and the race fueling tools (sweat-rate test, gut training). */
export default async function RacesPage() {
  const me = await requireUser();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const supabase = await createClient();
  const [races, tools, predictions, { data: tipsRow }] = await Promise.all([getRaces(me.id), getRaceTools(me.id), getPredictions(supabase, me.id, me.timezone), supabase.from("profiles").select("seen_tips").eq("id", me.id).maybeSingle()]);
  const upcoming = races.filter((r) => r.race_date >= today);
  const past = races.filter((r) => r.race_date < today).reverse();
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">Racing</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">Races</h1>
      <p className="mt-2 text-white/55">Add your races to get a fueling plan for each, and race-week mode on Today 10 days out.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-4 text-lg font-medium">Coming up</h2>
          <RaceList races={upcoming} today={today} units={me.units} empty="No races on the calendar yet. Add one below." />
          {past.length > 0 && (
            <details className="mt-4">
              <summary className="min-h-11 cursor-pointer py-2 text-sm text-white/55">Past races ({past.length})</summary>
              <RaceList races={past} today={today} units={me.units} />
            </details>
          )}
        </section>
        <div>
          <Spotlight tip={TIPS.predictions} seen={seen((tipsRow?.seen_tips ?? []) as string[], TIPS.predictions.id)} />
          <PredictionsCard view={predictions} />
        </div>
        <section className={card}>
          <h2 className="mb-4 text-lg font-medium">Add a race</h2>
          <RaceForm units={me.units} />
        </section>
        <section className={card} id="sweat">
          <h2 className="mb-1 text-lg font-medium">Sweat-rate test</h2>
          <p className="mb-4 text-sm text-white/50">{tools.sweatRateMlH ? `Your sweat rate: about ${tools.sweatRateMlH} ml per hour (average of your latest tests).` : "Sizes how much to drink on race day."}</p>
          <SweatTest units={me.units} tests={tools.sweats} />
        </section>
        <section className={card} id="gut">
          <h2 className="mb-1 text-lg font-medium">Gut training</h2>
          <GutTraining sessions={tools.guts} best={tools.gutMaxCarbs} />
        </section>
      </div>
      <p className="mt-10 text-xs text-white/40">General sports-nutrition guidance, not medical or dietetic advice.</p>
    </DashboardShell>
  );
}

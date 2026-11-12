import { Backpack, CalendarDays, Dumbbell, Flag, Footprints, Gauge, Gem, HeartPulse, Image, KeyRound, LifeBuoy, Plug, Settings, ShieldCheck, Sparkles, Sun, Target, Utensils } from "lucide-react";
import type { Metadata } from "next";

import DashboardShell from "@/components/layout/DashboardShell";
import { MeGroup, type MeRow } from "@/components/me/MeMenu";
import ProfileView from "@/components/profile/ProfileView";
import { FORM, type FormMetric } from "@/lib/activity/form";
import { paceOf } from "@/lib/activity/format";
import { cleanCloset } from "@/lib/closet";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Me · Diastole" };

const FLAG_WORD: Record<string, string> = { green: "Ready", yellow: "Caution", red: "Recover" };
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * The Me tab: your avatar, then one row for each thing about you, each opening its own page.
 * Every number and setting has exactly one home; rows only summarize.
 */
export default async function MePage() {
  const me = await requireUser();
  const supabase = await createClient();
  const isCoach = me.role === "coach";
  const units = me.units === "km" ? "km" : "mi";

  const [{ data: readiness }, { data: devices }, { data: intervals }, { data: zones }, { data: gearRow }, { data: goals }, { data: notes }] = await Promise.all([
    supabase.from("readiness_scores").select("overall, note").eq("athlete_id", me.id).order("date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("device_connections").select("source").eq("athlete_id", me.id),
    supabase.from("intervals_connections").select("athlete_id").eq("athlete_id", me.id).maybeSingle(),
    supabase.from("athlete_zones").select("ftp_w, threshold_speed_mps, threshold_hr").eq("athlete_id", me.id).maybeSingle(),
    supabase.from("athlete_gear").select("gear").eq("athlete_id", me.id).maybeSingle(),
    supabase.from("athlete_goals").select("race_name, race_date").eq("athlete_id", me.id).maybeSingle(),
    supabase.rpc("my_form_insights"),
  ]);

  const flag = readiness?.overall && FLAG_WORD[readiness.overall];
  const body = flag ? `${flag}${readiness?.note ? ` · ${readiness.note}` : ""}` : "Recovery, sleep, stress and load";

  const firstNote = ((notes ?? []) as { issue_key: string }[])[0];
  const formMetric = firstNote ? FORM[firstNote.issue_key.split(":")[0] as FormMetric]?.label : null;
  const form = formMetric ? `${formMetric} flagged in recent runs` : "Your runs compared with your usual";

  const pace = zones?.threshold_speed_mps ? paceOf(Number(zones.threshold_speed_mps), units) : null;
  const numbers = [zones?.ftp_w ? `FTP ${zones.ftp_w} W` : null, pace ? `${pace} /${units}` : null, zones?.threshold_hr ? `LTHR ${zones.threshold_hr}` : null].filter(Boolean).join(" · ") || "FTP, threshold pace, heart rates";

  const closet = cleanCloset(gearRow?.gear);
  const gear = closet.shoes.length || closet.bikes.length ? [closet.shoes.length ? plural(closet.shoes.length, "shoe") : null, closet.bikes.length ? plural(closet.bikes.length, "bike") : null, closet.trainer.kind !== "none" ? "trainer" : null].filter(Boolean).join(" · ") : "Shoes, bikes, trainer, pool access";

  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const days = goals?.race_date ? Math.round((Date.parse(`${goals.race_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000) : null;
  const goal = goals?.race_name ? `${goals.race_name}${days != null && days >= 0 ? ` · in ${days} days` : ""}` : "Goal race, block, PRs and your numbers over time";

  const sources = new Set((devices ?? []).map((d) => d.source));
  const linked = [sources.has("garmin") ? "Garmin" : null, sources.has("apple") ? "Apple Watch" : null, intervals ? "Zwift & Rouvy" : null].filter(Boolean);
  const connections = linked.length ? `${linked.join(" · ")} connected` : "Connect your watch";

  // A coach's own athlete pages live here (their tabs are for coaching).
  const myTraining: MeRow[] = isCoach
    ? [
        { href: "/me", icon: Sun, title: "My day", summary: "Today's workout, fuel and check-in" },
        { href: "/training", icon: Dumbbell, title: "My training", summary: "Calendar and finished workouts" },
        { href: "/fuel", icon: Utensils, title: "My fuel", summary: "Today's targets and log" },
      ]
    : [];

  return (
    <DashboardShell role={isCoach ? "coach" : "athlete"}>
      <ProfileView id={me.id} me={me} order={[]} hero="compact" />
      <div className="mx-auto max-w-3xl pb-6">
        <MeGroup title="My training" rows={myTraining} />
        <MeGroup
          title="How I'm doing"
          rows={[
            { href: "/account/body", icon: HeartPulse, title: "Body & recovery", summary: body },
            { href: "/account/form", icon: Footprints, title: "Running form", summary: form },
            { href: "/account/progress", icon: Target, title: "Goals & progress", summary: goal },
            { href: "/races", icon: Flag, title: "Races", summary: "Your race calendar and results" },
          ]}
        />
        <MeGroup
          title="My setup"
          rows={[
            { href: "/me/setup#numbers", icon: Gauge, title: "My numbers", summary: numbers },
            { href: "/me/setup#closet", icon: Backpack, title: "Gear & closet", summary: gear },
            { href: "/me/setup#week", icon: CalendarDays, title: "Training days", summary: "When you train and for how long" },
          ]}
        />
        <MeGroup
          rows={[
            { href: "/connect", icon: Plug, title: "Connections", summary: connections },
            { href: "/account/settings", icon: Settings, title: "Settings", summary: "Profile, notifications, appearance, tabs" },
          ]}
        />
        <MeGroup
          rows={[
            { href: "/me/grit", icon: Gem, title: "Grit", summary: "Your balance, history and the store" },
            { href: "/me/confidence", icon: ShieldCheck, title: "Confidence bank", summary: "Proof you're ready, saved as you train" },
            { href: "/me/posters", icon: Image, title: "Poster collection", summary: "Finished race posters you kept" },
            { href: "/me/story", icon: Sparkles, title: "Season story", summary: "Your training in one shareable picture" },
            { href: "/me/secrets", icon: KeyRound, title: "Secrets", summary: "Little surprises hidden around Diastole" },
            { href: "/help", icon: LifeBuoy, title: "Help" },
          ]}
        />
      </div>
    </DashboardShell>
  );
}

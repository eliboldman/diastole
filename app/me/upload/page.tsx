import type { Metadata } from "next";

import ActivityUpload from "@/components/ActivityUpload";
import AthleteShell from "@/components/AthleteShell";
import BackLink from "@/components/layout/BackLink";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Upload a workout · Diastole" };

export default async function UploadActivityPage() {
  const me = await requireUser();
  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <BackLink href="/connect" label="Connections" />
      <h1 className="mt-2 text-3xl font-medium tracking-tight">Upload a workout</h1>
      <p className="mt-2 max-w-xl text-white/60">
        For workouts that don&apos;t sync on their own, like rides from Rouvy, Zwift or TrainerRoad. Garmin doesn&apos;t share workouts
        that other apps sent to Garmin Connect, so add the file here.
      </p>
      <div className="mt-8 grid max-w-2xl gap-6">
        <ActivityUpload athleteId={me.id} />
        <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 text-sm text-white/60">
          <p className="font-medium text-white/80">Where to get the file</p>
          <ul className="mt-2 grid list-disc gap-1 pl-5">
            <li>Garmin Connect: open the workout, then ⚙️ → Export Original (a .zip is fine).</li>
            <li>Rouvy, Zwift, TrainerRoad: download the .fit file from the workout&apos;s page.</li>
          </ul>
          <p className="mt-3 text-white/45">
            Diastole keeps the charts, laps and the route with the first and last 200 m removed, then discards the file. If your watch syncs
            the same workout later, the synced copy replaces this one.
          </p>
        </div>
      </div>
    </AthleteShell>
  );
}

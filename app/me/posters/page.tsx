import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import AthleteShell from "@/components/AthleteShell";
import { PosterArt } from "@/components/poster/RacePoster";
import { raceDistance } from "@/components/race/RaceList";
import { posterState } from "@/lib/poster/poster";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Posters · Diastole" };
const SPORT: Record<string, string> = { run: "Run", bike: "Ride", swim: "Swim", tri: "Triathlon", other: "Race" };

/** Finished race posters the athlete chose to keep. */
export default async function PostersPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const { data: races } = await supabase.from("races").select("id, name, race_date, sport, distance_km").eq("athlete_id", me.id).eq("poster_kept", true).order("race_date", { ascending: false });
  const full = posterState([], "0000-01-01", "9999-12-31"); // kept posters are finished: all color
  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <Link href="/account" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm text-white/60 hover:bg-white/[0.05] hover:text-white">
        <ChevronLeft size={16} aria-hidden /> Profile
      </Link>
      <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">Poster collection</h1>
      <p className="mt-2 text-white/55">Every A race you&apos;ve finished and kept, in full color.</p>
      {!races?.length ? (
        <p className="mt-8 text-white/55">None yet. After an A race, tick &ldquo;Keep in my poster collection&rdquo; on its page.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {races.map((r) => (
            <li key={r.id}>
              <Link href={`/races/${r.id}`} className="lift block rounded-[22px] border border-white/10 bg-white/[0.04] p-2 transition hover:bg-white/[0.07]">
                <PosterArt
                  sport={(r.sport as "run" | "bike" | "swim" | "tri" | "other") ?? "other"}
                  name={r.name}
                  date={new Date(`${r.race_date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  line={[SPORT[r.sport], raceDistance(r.distance_km === null ? null : Number(r.distance_km), me.units)].filter(Boolean).join(" · ")}
                  state={full}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AthleteShell>
  );
}

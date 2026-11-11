import Link from "next/link";

import { sportLabel } from "@/lib/activity/format";
import { FEEL, normalizePain, PAIN_COLOR, PAIN_LABEL, RPE_LABEL, sessionLoad, SPOTS, spotLabel, type PainLevel } from "@/lib/avatar/pain";
import { createClient } from "@/lib/supabase/server";

/** The coach's view of an athlete's recent check-ins: feel, effort, load, pain, notes. */
export default async function RecentCheckins({ athleteId, timeZone }: { athleteId: string; timeZone: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workout_checkins")
    .select("activity_id, feel, rpe, fuel, pain, note, created_at, activities!inner(name, sport, start_time, duration_s)")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false })
    .limit(8);
  const rows = (data ?? []).map((r) => ({ ...r, act: r.activities as unknown as { name: string | null; sport: string | null; start_time: string; duration_s: number | null } }));
  if (!rows.length) return <p className="text-sm text-white/55">No check-ins yet. After each workout the athlete is asked how it felt, how hard it was, and whether anything hurts.</p>;
  return (
    <ul className="divide-y divide-white/[0.06]">
      {rows.map((r) => {
        const f = FEEL.find((x) => x.v === r.feel);
        const pain = normalizePain(r.pain);
        const spots = SPOTS.filter((s) => pain[s]);
        const load = sessionLoad(r.rpe, r.act.duration_s);
        return (
          <li key={r.activity_id}>
            <Link href={`/activity/${r.activity_id}#checkin`} className="block py-3 transition hover:bg-white/[0.02]">
              <span className="flex items-center gap-3">
                <span className="w-8 shrink-0 text-center text-2xl" aria-label={f?.label ?? "No feel"}>
                  {f?.emoji ?? "·"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.act.name || sportLabel(r.act.sport)}</span>
                  <span className="block truncate text-xs text-white/50">
                    {[
                      new Date(r.act.start_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone }),
                      r.rpe ? `RPE ${r.rpe} · ${RPE_LABEL[r.rpe]}` : null,
                      load ? `load ${load}` : null,
                      r.fuel ? (r.fuel === "all" ? "fuel: all of it" : r.fuel === "some" ? "fuel: some" : "fuel: none") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </span>
              {(spots.length > 0 || r.note) && (
                <span className="mt-1.5 block pl-11">
                  {spots.length > 0 && (
                    <span className="flex flex-wrap gap-1.5">
                      {spots.map((s) => (
                        <span key={s} className="flex items-center gap-1.5 rounded-full border border-rose-300/25 bg-rose-300/[0.06] px-2.5 py-0.5 text-xs">
                          <span className="h-2 w-2 rounded-full" style={{ background: PAIN_COLOR[pain[s] as PainLevel] }} aria-hidden />
                          {`${spotLabel(s)} · ${PAIN_LABEL[pain[s] as PainLevel]}`}
                        </span>
                      ))}
                    </span>
                  )}
                  {r.note && <span className="mt-1 block break-words text-sm text-white/70">{`"${r.note}"`}</span>}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

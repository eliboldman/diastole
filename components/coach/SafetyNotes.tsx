import { ChevronRight, ShieldCheck } from "lucide-react";
import Link from "next/link";

import SafetyNoteActions from "@/components/coach/SafetyNoteActions";
import { createClient } from "@/lib/supabase/server";

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Private fueling notes for the coach (Phase 9c). Row-level security means only the athlete's coach
 * ever gets these rows; athletes never see this card. Pass `athleteId` for one athlete's page.
 */
export default async function SafetyNotes({ athleteId }: { athleteId?: string }) {
  const supabase = await createClient();
  let q = supabase.from("safety_notes").select("id, athlete_id, created_on, updated_on, summary, profiles!safety_notes_athlete_id_fkey(full_name)").eq("status", "open").order("updated_on", { ascending: false }).limit(20);
  if (athleteId) q = q.eq("athlete_id", athleteId);
  const { data } = await q;
  // Latest open note per athlete.
  const seen = new Set<string>();
  const notes = (data ?? []).filter((n) => (seen.has(n.athlete_id) ? false : (seen.add(n.athlete_id), true)));
  if (!notes.length) return null;

  return (
    <section id="safety" className={`row-in scroll-mt-6 rounded-[28px] ${athleteId ? "" : "mt-6"} border border-sky-200/20 bg-sky-200/[0.05] p-5 backdrop-blur-xl lg:col-span-2`}>
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-sky-200" aria-hidden />
        <h2 className="font-medium">{notes.length === 1 ? "A private fueling note" : `${notes.length} private fueling notes`}</h2>
      </div>
      <p className="mt-1 text-xs text-white/50">Only you can see this. Based only on fully logged days; partial or missing logs never count.</p>
      <ul className="mt-4 space-y-3">
        {notes.map((n) => {
          const name = (n.profiles as unknown as { full_name: string | null } | null)?.full_name || "Athlete";
          return (
            <li key={n.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              {athleteId ? (
                <p className="text-xs text-white/45">{`Since ${day(n.created_on)}${n.updated_on !== n.created_on ? ` · updated ${day(n.updated_on)}` : ""}`}</p>
              ) : (
                <Link href={`/athlete/${n.athlete_id}#fuel`} className="flex min-h-10 items-center justify-between gap-2">
                  <span className="truncate font-medium">{name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-white/45">
                    {`since ${day(n.created_on)}`} <ChevronRight size={14} aria-hidden />
                  </span>
                </Link>
              )}
              <p className="mt-1 text-sm leading-relaxed text-white/80">{n.summary}.</p>
              <SafetyNoteActions id={n.id} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

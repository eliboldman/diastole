import { Dumbbell } from "lucide-react";

import StrengthRulesForm, { SuggestionRow } from "@/components/strength/StrengthCoachParts";
import { BY_SLUG } from "@/lib/strength/catalog";
import { DEFAULT_RULES, showKg, type Change, type LoggedItem, type Rules } from "@/lib/strength/workout";
import { createClient } from "@/lib/supabase/server";

const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Coach: progression rules to approve, suggestions waiting, and recent strength sessions. */
export default async function StrengthCoachCard({ athleteId, units }: { athleteId: string; units: "mi" | "km" }) {
  const supabase = await createClient();
  const [{ data: rules }, { data: pending }, { data: logs }, { count: planned }] = await Promise.all([
    supabase.from("strength_rules").select("rules, auto, approved_at").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("strength_suggestions").select("id, changes, created_at, planned_workouts(title, scheduled_date)").eq("athlete_id", athleteId).eq("status", "pending").order("created_at", { ascending: false }).limit(10),
    supabase.from("strength_logs").select("id, date, rpe, items, duration_s").eq("athlete_id", athleteId).order("date", { ascending: false }).limit(5),
    supabase.from("planned_workouts").select("id", { count: "exact", head: true }).eq("athlete_id", athleteId).eq("sport", "strength").is("deleted_at", null),
  ]);
  if (!planned && !logs?.length) return null;
  const unit = units === "km" ? "kg" : "lb";
  const r: Rules = { ...DEFAULT_RULES, ...((rules?.rules ?? {}) as Partial<Rules>) };
  return (
    <section id="strength" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Dumbbell size={18} className="text-emerald-200" aria-hidden /> Strength
      </h2>
      {(pending ?? []).length > 0 && (
        <div className="mt-3">
          <h3 className="text-sm font-medium text-white/80">Next weights to approve</h3>
          <ul className="mt-2 space-y-2">
            {(pending ?? []).map((p) => {
              const w = p.planned_workouts as unknown as { title: string; scheduled_date: string } | null;
              return <SuggestionRow key={p.id} id={p.id} title={w ? `${w.title} · ${day(w.scheduled_date)}` : "Next session"} changes={p.changes as Change[]} unit={unit} />;
            })}
          </ul>
        </div>
      )}
      <div className="mt-4">
        <h3 className="text-sm font-medium text-white/80">Progression rules</h3>
        <p className="mt-0.5 text-xs text-white/50">
          {rules ? `Approved ${day(String(rules.approved_at).slice(0, 10))}.` : "Not approved yet: suggestions wait for you until you approve these."} Leg loads never go up the session before a key bike or run, and heavy legs are lightened 20% that day.
        </p>
        <StrengthRulesForm athleteId={athleteId} initial={r} auto={rules?.auto ?? false} approved={Boolean(rules)} unit={unit} />
      </div>
      {(logs ?? []).length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-white/80">Recent sessions</h3>
          <ul className="mt-2 divide-y divide-white/[0.07] text-sm">
            {(logs ?? []).map((l) => (
              <li key={l.id} className="py-2">
                <span className="text-white/80">{day(l.date)}</span>
                <span className="text-white/50">
                  {" "}· RPE {l.rpe ?? "–"}
                  {l.duration_s ? ` · ${Math.round(l.duration_s / 60)} min` : ""}
                </span>
                <span className="block truncate text-xs text-white/50">
                  {(l.items as LoggedItem[])
                    .map((i) => {
                      const top = i.sets.reduce<number | null>((m, s) => (s.kg && (!m || s.kg > m) ? s.kg : m), null);
                      return `${BY_SLUG.get(i.slug)?.name ?? i.slug} ${i.sets.length}×${i.sets[0]?.seconds ? `${i.sets[0].seconds}s` : (i.sets[0]?.reps ?? "–")}${top ? ` @ ${showKg(top, unit)}` : ""}`;
                    })
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

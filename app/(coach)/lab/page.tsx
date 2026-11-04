import type { Metadata } from "next";
import Link from "next/link";

import { SuggestionCard, type SuggestionView } from "@/components/coach/AiSuggestions";
import { FlagBadge } from "@/components/coach/Flags";
import LabControls from "@/components/coach/LabControls";
import DashboardShell from "@/components/layout/DashboardShell";
import { AI_MODELS, DEFAULT_SETTINGS, monthToDateSpend, type AiModel } from "@/lib/ai/coach";
import { SCENARIOS, type Scenario } from "@/lib/ai/scenarios";
import type { Flag } from "@/lib/readiness/engine";
import { createClient, requireCoach } from "@/lib/supabase/server";
import type { Step } from "@/lib/workouts/garmin-format";

// Server actions on this page can run the Claude analysis (tens of seconds).
export const maxDuration = 120;

export const metadata: Metadata = { title: "AI test mode · Diastole" };

const NO_ID = "00000000-0000-0000-0000-000000000000"; // matches nothing when there are no test athletes
const ORDER: Scenario[] = ["poor_sleep", "high_load", "normal", "missing_data"];

export default async function LabPage() {
  const coach = await requireCoach();
  const supabase = await createClient();

  const { data: athletes } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("coach_id", coach.id)
    .eq("is_test", true);
  const ids = (athletes ?? []).map((a) => a.id);

  const [{ data: readiness }, { data: workouts }, { data: raw }, { data: settingsRow }, spent] = await Promise.all([
    supabase.from("readiness_scores").select("athlete_id, date, overall, note").in("athlete_id", ids.length ? ids : [NO_ID]).order("date", { ascending: false }),
    supabase
      .from("planned_workouts")
      .select("athlete_id, id, scheduled_date, title, status")
      .in("athlete_id", ids.length ? ids : [NO_ID])
      .is("deleted_at", null)
      .order("scheduled_date"),
    supabase
      .from("ai_suggestions")
      .select("id, athlete_id, date, overall, concern, summary, action, rationale, proposed_workout, status, planned_workouts!ai_suggestions_target_workout_id_fkey(title, scheduled_date)")
      .in("athlete_id", ids.length ? ids : [NO_ID])
      .order("created_at", { ascending: false }),
    supabase.from("coach_settings").select("ai_enabled, ai_model, ai_monthly_cap_usd").eq("coach_id", coach.id).maybeSingle(),
    monthToDateSpend(coach.id),
  ]);
  const ai = { ...DEFAULT_SETTINGS, ...(settingsRow ?? {}) };

  const scenarioOf = (name: string | null) => (Object.keys(SCENARIOS) as Scenario[]).find((k) => SCENARIOS[k].name === name);
  const rows = (athletes ?? [])
    .map((a) => ({ ...a, scenario: scenarioOf(a.full_name) }))
    .sort((a, b) => ORDER.indexOf(a.scenario ?? "normal") - ORDER.indexOf(b.scenario ?? "normal"));

  const seen = new Set<string>();
  const suggestions: SuggestionView[] = (raw ?? [])
    .filter((r) => (seen.has(r.athlete_id) ? false : (seen.add(r.athlete_id), true)))
    .map((r) => {
      const target = r.planned_workouts as unknown as { title: string; scheduled_date: string } | null;
      return {
        id: r.id,
        athleteId: r.athlete_id,
        athleteName: athletes?.find((a) => a.id === r.athlete_id)?.full_name ?? "Test athlete",
        overall: r.overall,
        concern: r.concern,
        summary: r.summary,
        action: r.action,
        rationale: r.rationale,
        target: target ? { title: target.title, date: target.scheduled_date } : null,
        proposed: r.proposed_workout as { title: string; sport: string; scheduled_date: string; steps: Step[] } | null,
        status: r.status,
      };
    });

  return (
    <DashboardShell tone="blue">
      <p className="text-sm uppercase tracking-[0.25em] text-sky-200/70">Coaching assistant</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">AI test mode</h1>
      <p className="mt-3 max-w-2xl text-white/60">
        Fake athletes with set scenarios. Run the morning analysis on them and try Approve, Edit and Dismiss end to end.
        They never have a watch, and nothing is sent to any device. They don&apos;t appear on your dashboard or roster,
        and the daily run skips them.
      </p>

      <LabControls
        hasAthletes={rows.length > 0}
        enabled={ai.ai_enabled}
        hasKey={Boolean(process.env.ANTHROPIC_API_KEY)}
        modelLabel={AI_MODELS[ai.ai_model as AiModel]?.label ?? ai.ai_model}
        spent={spent}
        cap={Number(ai.ai_monthly_cap_usd)}
      />

      {rows.length > 0 && (
        <section className="stagger mt-8 grid gap-3 sm:grid-cols-2">
          {rows.map((a) => {
            const r = readiness?.find((x) => x.athlete_id === a.id);
            const meta = a.scenario ? SCENARIOS[a.scenario] : null;
            const plan = (workouts ?? []).filter((w) => w.athlete_id === a.id);
            return (
              <Link key={a.id} href={`/athlete/${a.id}`} className="lift block rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{a.full_name?.replace(/^Test · /, "")}</p>
                  <FlagBadge flag={(r?.overall as Flag) ?? "unknown"} />
                </div>
                {meta && <p className="mt-2 text-sm text-white/65">{meta.blurb}</p>}
                {r?.note && <p className="mt-2 text-sm text-white/80">Engine: {r.note}</p>}
                {meta && <p className="mt-2 text-xs text-sky-200/80">Expected: {meta.expect}</p>}
                {plan.length > 0 && (
                  <p className="mt-3 text-xs text-white/50">
                    Planned:{" "}
                    {plan
                      .map((w) => `${new Date(`${w.scheduled_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })} ${w.title}`)
                      .join(" · ")}
                  </p>
                )}
              </Link>
            );
          })}
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Suggestions</h2>
          <p className="mt-1 text-sm text-white/55">Exactly what you&apos;d see on your dashboard for a real athlete.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {suggestions.map((s) => (
              <SuggestionCard key={s.id} s={s} test />
            ))}
          </div>
        </section>
      )}
    </DashboardShell>
  );
}

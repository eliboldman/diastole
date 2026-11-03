"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FLAG_STYLE } from "@/components/coach/Flags";
import { approveSuggestion, dismissSuggestion, editSuggestion, runAssistantNow, type AiResult } from "@/lib/ai/actions";
import type { Flag } from "@/lib/readiness/engine";
import type { Step } from "@/lib/workouts/garmin-format";

export type SuggestionView = {
  id: string;
  athleteId: string;
  athleteName: string;
  overall: Flag;
  concern: "low" | "medium" | "high";
  summary: string;
  action: "keep" | "reduce_intensity" | "easy_session" | "rest" | "replace";
  rationale: string;
  target: { title: string; date: string } | null;
  proposed: { title: string; sport: string; scheduled_date: string; steps: Step[] } | null;
  status: "pending" | "approved" | "edited" | "dismissed";
};

const ACTION_LABEL: Record<SuggestionView["action"], string> = {
  keep: "Keep the plan",
  reduce_intensity: "Reduce intensity",
  easy_session: "Swap to an easy session",
  rest: "Rest day",
  replace: "Replace the session",
};

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
function stepLine(s: Step): string {
  if (s.kind === "repeat") return `${s.times} × (${s.steps.map(stepLine).join(", ")})`;
  const d = s.duration.type === "time" ? clock(s.duration.seconds) : s.duration.type === "distance" ? `${s.duration.meters} m` : "until lap";
  const t = s.target?.type === "hr_zone" ? ` Z${s.target.zone}` : s.target ? " (target)" : "";
  return `${s.intensity.toLowerCase()} ${d}${t}`;
}
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<AiResult>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok && r.redirectTo) router.push(r.redirectTo);
      else router.refresh();
    });
  return { pending, msg, run };
}

function Card({ s }: { s: SuggestionView }) {
  const { pending, msg, run } = useRun();
  const flag = FLAG_STYLE[s.overall];
  const changesSchedule = s.action !== "keep" && (s.target || s.proposed);

  const confirmText = [
    `Approve for ${s.athleteName}: ${ACTION_LABEL[s.action]}?`,
    s.target && s.action !== "keep" ? `• Removes "${s.target.title}" (${day(s.target.date)})${""}` : "",
    s.proposed && s.action !== "keep" && s.action !== "rest" ? `• Sends "${s.proposed.title}" for ${day(s.proposed.scheduled_date)} to their device` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <article className="rounded-[24px] border border-white/10 bg-black/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/athlete/${s.athleteId}`} className="font-semibold hover:underline">
          {s.athleteName}
        </Link>
        <span className={`inline-flex items-center gap-2 text-xs ${flag.text}`}>
          <span className={`h-2 w-2 rounded-full ${flag.dot}`} aria-hidden /> {flag.label} · {s.concern} concern
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{s.summary}</p>

      <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-sm">
        <p className="font-medium">{ACTION_LABEL[s.action]}</p>
        <p className="mt-1 text-white/55">{s.rationale}</p>
        {s.target && s.action !== "keep" && (
          <p className="mt-2 text-white/45">
            Changes: <span className="text-white/70">{s.target.title}</span> ({day(s.target.date)})
          </p>
        )}
        {s.proposed && s.action !== "keep" && s.action !== "rest" && (
          <p className="mt-2 text-white/45">
            New: <span className="text-white/70">{s.proposed.title}</span> ({day(s.proposed.scheduled_date)}, {s.proposed.sport}) —{" "}
            {s.proposed.steps.map(stepLine).join(" → ")}
          </p>
        )}
      </div>

      {s.status === "pending" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            disabled={pending}
            onClick={() => (!changesSchedule || confirm(confirmText)) && run(() => approveSuggestion(s.id))}
            className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-300/20 disabled:opacity-50"
          >
            Approve
          </button>
          {s.proposed && (
            <button
              disabled={pending}
              onClick={() => run(() => editSuggestion(s.id))}
              className="rounded-xl border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/[0.06] disabled:opacity-50"
            >
              Edit
            </button>
          )}
          <button disabled={pending} onClick={() => run(() => dismissSuggestion(s.id))} className="px-2 text-sm text-white/40 hover:text-white">
            Dismiss
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs uppercase tracking-wider text-white/35">{s.status}</p>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-200" : "text-red-300"}`}>{msg.text}</p>}
    </article>
  );
}

export default function AiSuggestions({
  suggestions,
  spent,
  cap,
  modelLabel,
  enabled,
  hasKey,
}: {
  suggestions: SuggestionView[];
  spent: number;
  cap: number;
  modelLabel: string;
  enabled: boolean;
  hasKey: boolean;
}) {
  const { pending, msg, run } = useRun();
  return (
    <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.035] p-5 backdrop-blur-2xl sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Coaching assistant</h2>
          <p className="text-xs text-white/40">
            {modelLabel} · ${spent.toFixed(2)} of ${cap.toFixed(2)} this month · suggestions only, nothing changes until you approve
          </p>
        </div>
        <button
          disabled={pending || !enabled || !hasKey}
          onClick={() => run(runAssistantNow)}
          className="rounded-xl border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/[0.06] disabled:opacity-40"
        >
          {pending ? "Reviewing…" : "Run now"}
        </button>
      </div>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-200" : "text-red-300"}`}>{msg.text}</p>}
      {!hasKey && <p className="mt-3 text-sm text-amber-200/80">Add an Anthropic API key to turn this on.</p>}
      {hasKey && !enabled && <p className="mt-3 text-sm text-white/45">Turned off in Settings.</p>}

      {suggestions.length === 0 ? (
        <p className="mt-4 text-sm text-white/45">No suggestions today. The assistant only reviews athletes flagged yellow or red, each morning around 5–6 am.</p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {suggestions.map((s) => (
            <Card key={s.id} s={s} />
          ))}
        </div>
      )}
      <p className="mt-4 text-[11px] text-white/30">AI suggestions are training guidance for the coach, not medical advice.</p>
    </section>
  );
}

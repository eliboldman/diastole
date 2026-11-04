"use client";

import { Plus, Sparkles, X } from "lucide-react";
import { useState, useTransition } from "react";

import { addFormPick, checkFormNow, dismissFormInsight } from "@/lib/ai/form-actions";

export type InsightView = {
  id: string;
  issue: string; // e.g. "Ground contact time · across runs"
  summary: string;
  evidence: string | null;
  drills: string[];
  picks: { library_id: string; title: string; reason: string }[];
  status: "pending" | "added" | "dismissed";
  created_at: string;
};

/** Coach-only AI form insights for one athlete. Nothing reaches the athlete without approve & send. */
export default function FormInsights({
  athleteId,
  insights,
  tomorrow,
  compact = false,
}: {
  athleteId: string;
  insights: InsightView[];
  tomorrow: string;
  /** Endurance Lab list: open insights only, no per-athlete check button. */
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [dates, setDates] = useState<Record<string, string>>({});

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setMessage(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error ?? "Something went wrong." });
    });

  const open = insights.filter((i) => i.status === "pending");
  const done = insights.filter((i) => i.status !== "pending");

  return (
    <div className="grid gap-3">
      {open.length === 0 && !compact && <p className="text-sm text-white/55">No open form insights. They appear when an issue shows up in 3 of the last 5 runs.</p>}

      {open.map((i) => (
        <article key={i.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.15em] text-white/50">{i.issue}</p>
            <button
              disabled={pending}
              onClick={() => run(() => dismissFormInsight(i.id))}
              aria-label="Dismiss insight"
              className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/45 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <p className="mt-1 text-sm text-white/85">{i.summary}</p>
          {i.evidence && (
            <details className="mt-2 text-xs text-white/50">
              <summary className="cursor-pointer">The runs behind this</summary>
              <p className="mt-1 break-words">{i.evidence}</p>
            </details>
          )}
          {i.drills.length > 0 && (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-white/70">
              {i.drills.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {i.picks.length > 0 && (
            <div className="mt-3 grid gap-2">
              <label className="flex flex-wrap items-center gap-2 text-xs text-white/55">
                Add on
                <input
                  type="date"
                  value={dates[i.id] ?? tomorrow}
                  onChange={(e) => setDates({ ...dates, [i.id]: e.target.value })}
                  className="min-h-11 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white"
                />
              </label>
              {i.picks.map((p) => (
                <div key={p.library_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-white/55">{p.reason}</p>
                  </div>
                  <button
                    disabled={pending}
                    onClick={() => run(() => addFormPick(i.id, p.library_id, dates[i.id] ?? tomorrow))}
                    className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 text-sm text-emerald-100 transition active:scale-95 hover:bg-emerald-300/20 disabled:opacity-50"
                  >
                    <Plus size={15} aria-hidden /> Add as draft
                  </button>
                </div>
              ))}
            </div>
          )}
        </article>
      ))}

      {!compact && done.length > 0 && (
        <details className="text-sm text-white/55">
          <summary className="cursor-pointer">Earlier insights ({done.length})</summary>
          <ul className="mt-2 space-y-1">
            {done.map((i) => (
              <li key={i.id} className="truncate">
                {new Date(i.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {i.issue} · {i.status === "added" ? "added" : "dismissed"}
              </li>
            ))}
          </ul>
        </details>
      )}

      {message && <p className={`text-sm ${message.ok ? "text-emerald-100" : "text-red-200"}`}>{message.text}</p>}

      {!compact && (
        <>
          <button
            disabled={pending}
            onClick={() => run(() => checkFormNow(athleteId))}
            className="flex min-h-11 items-center gap-2 justify-self-start rounded-xl border border-white/15 bg-white/[0.05] px-4 text-sm text-white/80 transition active:scale-95 hover:bg-white/[0.1] disabled:opacity-50"
          >
            <Sparkles size={15} aria-hidden /> {pending ? "Checking…" : "Check form now"}
          </button>
          <p className="text-xs text-white/40">Runs each morning too. Claude is only asked when a new pattern appears, and it counts toward your monthly AI cap.</p>
        </>
      )}
    </div>
  );
}

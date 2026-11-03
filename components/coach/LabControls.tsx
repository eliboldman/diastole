"use client";

import { FlaskConical, Play, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createTestAthletes, deleteTestAthletes, runTestAnalysis, type AiResult } from "@/lib/ai/actions";

import { useToast } from "./Toast";

const btn = "flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-5 text-sm font-medium transition disabled:opacity-40";

export default function LabControls({
  hasAthletes,
  enabled,
  hasKey,
  modelLabel,
  spent,
  cap,
}: {
  hasAthletes: boolean;
  enabled: boolean;
  hasKey: boolean;
  modelLabel: string;
  spent: number;
  cap: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { show, element } = useToast(10000);

  const run = (label: string, fn: () => Promise<AiResult>) =>
    start(async () => {
      setBusy(label);
      navigator.vibrate?.(10);
      const r = await fn();
      setBusy(null);
      setConfirmRemove(false);
      router.refresh();
      show(r.ok ? r.message : r.error, { ok: r.ok });
    });

  return (
    <section className="mt-8 rounded-[28px] border border-sky-300/15 bg-sky-300/[0.04] p-5">
      <div className="grid gap-2 sm:grid-cols-3">
        <button
          disabled={pending}
          onClick={() => run("seed", createTestAthletes)}
          className={`${btn} border-white/15 bg-white/[0.06]`}
        >
          {hasAthletes ? <RotateCcw size={16} /> : <FlaskConical size={16} />}
          {busy === "seed" ? "Setting up…" : hasAthletes ? "Reset scenarios" : "Create test athletes"}
        </button>
        <button
          disabled={pending || !hasAthletes || !enabled || !hasKey}
          onClick={() => run("run", runTestAnalysis)}
          className={`${btn} border-emerald-300/30 bg-emerald-300/15 text-emerald-50`}
        >
          <Play size={16} />
          {busy === "run" ? "Claude is reviewing…" : "Run analysis now"}
        </button>
        {confirmRemove ? (
          <button disabled={pending} onClick={() => run("remove", deleteTestAthletes)} className={`${btn} border-red-300/30 bg-red-300/15 text-red-50`}>
            <Trash2 size={16} /> {busy === "remove" ? "Removing…" : "Yes, remove all test data"}
          </button>
        ) : (
          <button disabled={pending || !hasAthletes} onClick={() => setConfirmRemove(true)} className={`${btn} border-white/10 text-white/60`}>
            <Trash2 size={16} /> Remove test athletes
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-white/55">
        {modelLabel} · ${spent.toFixed(2)} of ${cap.toFixed(2)} this month. A test run reviews the flagged test athletes
        (usually three) in one call, roughly $0.05–0.15. Running again replaces their previous suggestions.
        {!hasKey && " Add an Anthropic API key to run it."}
        {hasKey && !enabled && " The assistant is turned off in Settings."}
      </p>
      {element}
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approvePlanBatch, discardPlanBatch } from "@/lib/ai/plan-actions";

export default function PlanBatchActions({ batchId, drafts }: { batchId: string; drafts: number }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"approve" | "discard" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: (id: string) => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn(batchId);
      setMsg(r.ok ? (r.message ?? "Done.") : (r.error ?? "Something went wrong."));
      setConfirm(null);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {confirm === "approve" ? (
        <button disabled={pending} onClick={() => run(approvePlanBatch)} className="min-h-12 rounded-2xl bg-emerald-300 px-5 text-sm font-medium text-black disabled:opacity-50">
          {pending ? "Sending…" : `Yes, send all ${drafts}`}
        </button>
      ) : (
        <button onClick={() => setConfirm("approve")} className="min-h-12 rounded-2xl bg-emerald-300 px-5 text-sm font-medium text-black">
          Approve all {drafts}
        </button>
      )}
      {confirm === "discard" ? (
        <button disabled={pending} onClick={() => run(discardPlanBatch)} className="min-h-12 rounded-2xl border border-red-300/30 px-5 text-sm text-red-200">
          Yes, discard {drafts}
        </button>
      ) : (
        <button onClick={() => setConfirm("discard")} className="min-h-12 px-3 text-sm text-white/55 hover:text-white">
          Discard drafts
        </button>
      )}
      <span className="text-xs text-white/40">Or open any one to edit it first.</span>
      {msg && <p className="w-full text-sm text-white/65">{msg}</p>}
    </div>
  );
}

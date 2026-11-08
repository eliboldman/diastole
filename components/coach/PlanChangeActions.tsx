"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { decidePlanChange } from "@/lib/workouts/life-actions";

export default function PlanChangeActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const go = (approve: boolean) =>
    start(async () => {
      const r = await decidePlanChange(id, approve);
      setMsg(r.ok ? r.message : r.error);
      router.refresh();
    });
  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => go(true)} className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-medium text-black disabled:opacity-60">
          Approve
        </button>
        <button type="button" disabled={pending} onClick={() => go(false)} className="min-h-11 rounded-xl px-4 text-sm text-white/60 hover:bg-white/[0.06]">
          Keep the plan
        </button>
      </div>
      {msg && <p className="mt-1 text-xs text-white/60" role="status">{msg}</p>}
    </div>
  );
}

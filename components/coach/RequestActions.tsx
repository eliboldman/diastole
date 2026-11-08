"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveRequest, declineRequest } from "@/lib/workouts/athlete-actions";

export default function RequestActions({ id, editHref }: { id: string; editHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const go = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ?? "Done.") : (r.error ?? "Something went wrong."));
      router.refresh();
    });
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => go(() => approveRequest(id))} className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-medium text-black disabled:opacity-60">
          Approve & send
        </button>
        <Link href={editHref} className="flex min-h-11 items-center rounded-xl px-3 text-sm text-white/70 hover:bg-white/[0.06]">
          Edit first
        </Link>
        <button type="button" disabled={pending} onClick={() => go(() => declineRequest(id))} className="ml-auto min-h-11 rounded-xl px-3 text-sm text-white/50 hover:text-rose-200">
          Decline
        </button>
      </div>
      {msg && <p className="mt-1 text-xs text-white/60" role="status">{msg}</p>}
    </div>
  );
}

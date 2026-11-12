"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { cancelInvite, removeDietitian } from "./actions";

/** One dietitian (or pending invite) with a two-tap remove. */
export default function DietitianRow({ id, label, sub, pending: isInvite, children }: { id: string; label: string; sub: string; pending?: boolean; children?: ReactNode }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const go = () =>
    start(async () => {
      const r = isInvite ? await cancelInvite(id) : await removeDietitian(id);
      setMsg(r.ok ? r.message : r.error);
      setArmed(false);
      if (r.ok) router.refresh();
    });
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
      <span>
        <span className="text-white/85">{label}</span>
        <span className="ml-2 text-white/45">{sub}</span>
      </span>
      <span className="flex items-center gap-2">
        {msg && <span className="text-xs text-white/55">{msg}</span>}
        {armed ? (
          <>
            <button onClick={go} disabled={busy} className="min-h-11 rounded-xl px-3 text-red-200 hover:bg-red-400/10 disabled:opacity-50">
              {busy ? "Removing…" : isInvite ? "Cancel invite" : "Remove access"}
            </button>
            <button onClick={() => setArmed(false)} className="min-h-11 rounded-xl px-3 text-white/50 hover:bg-white/[0.05]">
              Keep
            </button>
          </>
        ) : (
          <button onClick={() => setArmed(true)} className="min-h-11 rounded-xl px-3 text-white/50 hover:bg-red-400/10 hover:text-red-200">
            {isInvite ? "Cancel" : "Remove"}
          </button>
        )}
      </span>
      {children}
    </li>
  );
}

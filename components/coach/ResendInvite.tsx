"use client";

import { useState, useTransition } from "react";

import { resendInvite } from "@/app/(coach)/athletes/actions";

/** "Resend" on a pending invite (links expire). */
export default function ResendInvite({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="flex items-center gap-2">
      {note && <span className={`text-xs ${note.ok ? "text-emerald-200" : "text-red-200"}`}>{note.text}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { const r = await resendInvite(id); setNote(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error }); })}
        className="min-h-10 rounded-xl px-3 text-sm text-emerald-200 hover:bg-white/[0.05] disabled:opacity-50"
      >
        {pending ? "Sending…" : "Resend"}
      </button>
    </span>
  );
}

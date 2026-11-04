"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { checkFormAll } from "@/lib/ai/form-actions";

export default function CheckFormAll() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await checkFormAll();
            setMessage(r.ok ? r.message : r.error);
          })
        }
        className="flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-4 text-sm text-white/80 transition active:scale-95 hover:bg-white/[0.1] disabled:opacity-50"
      >
        <Sparkles size={15} aria-hidden /> {pending ? "Checking everyone…" : "Check everyone's form"}
      </button>
      {message && <p className="text-sm text-white/65" aria-live="polite">{message}</p>}
    </div>
  );
}

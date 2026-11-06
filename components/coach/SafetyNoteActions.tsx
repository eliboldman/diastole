"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { decideSafetyNote } from "@/lib/fuel/safety-actions";

export default function SafetyNoteActions({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (status: "talked" | "dismissed") =>
    start(async () => {
      const r = await decideSafetyNote(id, status);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button disabled={pending} onClick={() => decide("talked")} className="min-h-11 rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-sm text-white/85 disabled:opacity-50">
        Talked to them
      </button>
      <button disabled={pending} onClick={() => decide("dismissed")} className="min-h-11 rounded-2xl px-4 text-sm text-white/55 hover:bg-white/[0.05] disabled:opacity-50">
        Not a concern
      </button>
      {error && <p className="w-full text-sm text-amber-100/90">{error}</p>}
    </div>
  );
}

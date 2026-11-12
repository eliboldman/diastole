"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { spendShield } from "@/lib/grit/actions";
import { haptic } from "@/lib/haptics";

/** Shown on Streaks only when a missed day just ended a plan streak and a shield could cover it. */
export default function ShieldPrompt({ date, streak, shields }: { date: string; streak: number; shields: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const day = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  const go = () =>
    start(async () => {
      const r = await spendShield(date);
      setMsg(r.ok ? (r.message ?? "Shield up.") : r.error);
      if (r.ok) {
        haptic("success");
        router.refresh();
      }
    });
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-4 text-sm">
      <p className="min-w-0 flex-1 basis-56 text-white/70">
        {day}&apos;s missed session ended a {streak}-session plan streak. A streak shield keeps it going.
      </p>
      {msg ? (
        <p role="status" className="text-emerald-100">{msg}</p>
      ) : (
        <button type="button" disabled={pending} onClick={go} className="min-h-11 rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 font-medium text-emerald-50 transition active:scale-95 hover:bg-emerald-300/20 disabled:opacity-50">
          Use a shield ({shields} left)
        </button>
      )}
    </div>
  );
}

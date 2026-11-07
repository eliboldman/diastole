"use client";

import { useState, useTransition } from "react";

import { saveAthleteNotes } from "@/lib/ai/plan-actions";

/** The coach's private notes on one athlete: used for suggested workouts, never shown to the athlete. */
export default function AthleteNotes({ athleteId, initial, firstName }: { athleteId: string; initial: string; firstName: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value.slice(0, 8000));
          setMsg(null);
        }}
        rows={8}
        placeholder={`Goal, annual hours, current period, FTP or "unknown", swim level, constraints for ${firstName}…`}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[15px] leading-relaxed focus:border-emerald-300/40 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          disabled={pending || text === saved}
          onClick={() =>
            start(async () => {
              const r = await saveAthleteNotes(athleteId, text);
              setMsg(r.ok ? "Saved." : r.error);
              if (r.ok) setSaved(text);
            })
          } className="min-h-11 rounded-2xl border border-white/15 px-5 text-sm disabled:opacity-40">
          Save notes
        </button>
        <span className="text-xs text-white/40">Only you see these. {firstName} doesn&apos;t.</span>
        {msg && <span className="text-sm text-white/60">{msg}</span>}
      </div>
    </div>
  );
}

"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { savePredictionNote, setPredictionsHidden } from "@/lib/predict/actions";

/** Athlete: hide or show their own estimates. */
export function HideToggle({ hidden }: { hidden: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setPredictionsHidden(!hidden);
          router.refresh();
        })
      }
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-white/55 hover:text-white disabled:opacity-50"
    >
      {hidden ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
      {hidden ? "Show estimates" : "Hide"}
    </button>
  );
}

/** Coach: a note shown to the athlete with their estimates. */
export function NoteForm({ athleteId, initial }: { athleteId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await savePredictionNote(athleteId, text);
          setMsg(r.ok ? (text.trim() ? "Saved. They'll see it with their estimates." : "Note removed.") : (r.error ?? "Couldn't save."));
        });
      }}
      className="mt-3"
    >
      <label className="text-xs text-white/55" htmlFor="pred-note">
        Your note on these (the athlete sees it)
      </label>
      <textarea
        id="pred-note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={600}
        rows={2}
        placeholder="e.g. The 70.3 run assumes you pace the bike right. Aim for the low end."
        className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[16px] text-white placeholder:text-white/30 focus:border-emerald-300/40 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-3">
        <button disabled={pending || text === initial} className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-medium text-black disabled:opacity-40">
          {pending ? "Saving…" : "Save note"}
        </button>
        {msg && <span className="text-xs text-white/55">{msg}</span>}
      </div>
    </form>
  );
}

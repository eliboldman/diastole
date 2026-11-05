"use client";

import { Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { draftWhy, saveWhy } from "@/lib/ai/why";

/**
 * The coach's "why" for a planned workout. AI drafts land in this box only; the athlete sees the
 * text after the coach saves it, and never sees an unsaved draft.
 */
export default function WhyEditor({ workoutId, athleteFirstName, saved, draft }: { workoutId: string; athleteFirstName: string; saved: string | null; draft: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(saved ?? draft ?? "");
  const [fromAi, setFromAi] = useState(!saved && Boolean(draft));
  const [note, setNote] = useState<string | null>(!saved && draft ? "Unsaved AI draft from earlier." : null);
  const [error, setError] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();
  const [saving, startSave] = useTransition();
  const dirty = text.trim() !== (saved ?? "").trim();

  const draftIt = () =>
    startDraft(async () => {
      setError(null);
      const r = await draftWhy(workoutId);
      if (!r.ok) return setError(r.error);
      setText(r.draft);
      setFromAi(true);
      setNote(`AI draft (${r.costUsd < 0.01 ? "under 1¢" : `${(r.costUsd * 100).toFixed(1)}¢`}). Edit it, then save. ${athleteFirstName} sees nothing until you do.`);
    });

  const save = () =>
    startSave(async () => {
      setError(null);
      const r = await saveWhy(workoutId, text);
      if (!r.ok) return setError(r.error);
      navigator.vibrate?.([8, 30, 8]);
      setFromAi(false);
      setNote(text.trim() ? `Saved. ${athleteFirstName} sees this with the workout.` : "Cleared.");
      router.refresh();
    });

  return (
    <div>
      <textarea
        value={text}
        maxLength={400}
        rows={3}
        onChange={(e) => {
          setText(e.target.value);
          setNote(null);
        }}
        placeholder={`What this session is for, in a sentence or two. ${athleteFirstName} sees it with the workout.`}
        className={`w-full resize-y rounded-2xl border bg-white/[0.04] px-4 py-3 text-base leading-relaxed text-white placeholder:text-white/35 focus:outline-none sm:text-sm ${
          fromAi && dirty ? "border-amber-200/40 focus:border-amber-200/60" : "border-white/10 focus:border-emerald-300/40"
        }`}
        aria-label="Why this workout"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="flex min-h-11 items-center gap-2 rounded-full bg-emerald-300 px-5 text-sm font-medium text-black transition hover:bg-emerald-200 disabled:opacity-50"
        >
          <Check size={16} /> {saving ? "Saving…" : text.trim() ? `Save for ${athleteFirstName}` : "Clear"}
        </button>
        <button
          type="button"
          onClick={draftIt}
          disabled={drafting}
          className="flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-sm text-white/80 transition hover:bg-white/[0.09] disabled:opacity-60"
        >
          <Sparkles size={15} className={drafting ? "animate-pulse text-amber-200" : "text-amber-200"} />
          {drafting ? "Drafting…" : text.trim() ? "Redraft with AI" : "Draft with AI"}
        </button>
        <span className="text-xs text-white/40">{`${text.length}/400`}</span>
      </div>
      {note && <p className="mt-2 text-xs text-white/55">{note}</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}

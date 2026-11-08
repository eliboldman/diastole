"use client";

import { ArrowRight, Check, Loader2, Minus, MoveRight, Plus, Shuffle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { applyChange, planChange, type SwapPreview } from "@/lib/ai/swap";

const day = (d: string, today: string) => {
  const diff = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};

/**
 * "Change of plans": one line to say what's changing. Shows the change as a short before/after,
 * then one tap applies it (calendar and watch). Scoped to one athlete when `athleteId` is given;
 * otherwise it figures out who from the sentence (the coach themself by default).
 */
export default function ChangeOfPlans({ athleteId, today, placeholder }: { athleteId?: string; today: string; placeholder?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<SwapPreview | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [thinking, think] = useTransition();
  const [applying, apply] = useTransition();

  const ask = () => {
    if (!text.trim() || thinking) return;
    setError(null);
    setQuestion(null);
    setDone(null);
    setPreview(null);
    think(async () => {
      const r = await planChange({ text, athleteId: athleteId ?? null });
      if (!r.ok) setError(r.error);
      else if ("question" in r) setQuestion(r.question);
      else setPreview(r.preview);
    });
  };

  const doIt = () => {
    if (!preview) return;
    apply(async () => {
      const r = await applyChange(preview);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPreview(null);
      setText("");
      setDone(r.message);
      router.refresh();
    });
  };

  return (
    <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.05] p-4 sm:p-5" aria-label="Change of plans">
      {!preview && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
          className="flex items-center gap-2"
        >
          <Shuffle size={18} className="ml-1 shrink-0 text-emerald-200/80" aria-hidden />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={800}
            disabled={thinking}
            placeholder={placeholder ?? "Change of plans? e.g. easy long run instead of today's ride"}
            aria-label="What's changing?"
            className="min-h-12 min-w-0 flex-1 bg-transparent px-1 text-base placeholder:text-white/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim() || thinking}
            aria-label="Work it out"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-300 text-black transition active:scale-90 disabled:bg-white/10 disabled:text-white/40"
          >
            {thinking ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          </button>
        </form>
      )}

      {thinking && <p className="mt-2 px-1 text-sm text-white/50">Looking at the schedule…</p>}
      {question && <p className="mt-3 px-1 text-sm text-amber-100">{question} Add a bit more above and send again.</p>}
      {error && <p className="mt-3 px-1 text-sm text-amber-200">{error}</p>}
      {done && (
        <p className="mt-3 flex items-start gap-2 px-1 text-sm text-emerald-100" role="status">
          <Check size={16} className="mt-0.5 shrink-0" aria-hidden /> {done}
        </p>
      )}

      {preview && (
        <div>
          <p className="px-1 font-medium">{preview.summary}</p>
          {preview.athleteName !== "you" && <p className="px-1 text-xs text-white/50">For {preview.athleteName}</p>}
          <ul className="mt-3 space-y-2">
            {preview.removes.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-3 py-2.5">
                <Minus size={16} className="shrink-0 text-rose-300" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-white/55 line-through decoration-white/30">{r.title}</span>
                <span className="shrink-0 text-xs text-white/45">{day(r.date, today)}</span>
              </li>
            ))}
            {preview.moves.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-3 py-2.5">
                <MoveRight size={16} className="shrink-0 text-sky-300" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{m.title}</span>
                <span className="shrink-0 text-xs text-white/55">
                  {day(m.from, today)} → {day(m.to, today)}
                </span>
              </li>
            ))}
            {preview.adds.map((a, i) => (
              <li key={i} className="rounded-2xl bg-emerald-300/[0.06] px-3 py-2.5">
                <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-3 text-left" aria-expanded={open === i}>
                  <Plus size={16} className="shrink-0 text-emerald-300" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{a.title}</span>
                  <span className="shrink-0 text-xs text-white/55">{day(a.date, today)}</span>
                </button>
                {open === i && (
                  <div className="mt-2 pl-7 text-sm text-white/65">
                    <ul className="space-y-0.5">
                      {a.lines.map((l, k) => (
                        <li key={k}>{l}</li>
                      ))}
                    </ul>
                    {a.note && <p className="mt-2 text-xs text-white/45">{a.note}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {preview.adds.length > 0 && <p className="mt-2 px-1 text-xs text-white/40">Tap a new workout to see its steps.</p>}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={doIt}
              disabled={applying}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-300 font-medium text-black transition active:scale-[0.98] disabled:opacity-60"
            >
              {applying ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Do it
            </button>
            <button type="button" onClick={() => setPreview(null)} disabled={applying} className="min-h-12 rounded-2xl px-4 text-white/65 hover:bg-white/[0.06]">
              Not quite
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

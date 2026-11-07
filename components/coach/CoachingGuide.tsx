"use client";

import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import type { SplitDoc } from "@/lib/ai/coaching-doc";
import { previewCoachingDoc, saveCoachingImport, savePhilosophy } from "@/lib/ai/plan-actions";

const area = "w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[15px] leading-relaxed focus:border-emerald-300/40 focus:outline-none";

/**
 * The coach's coaching guide (philosophy, rules, weekly skeleton) for suggested workouts.
 * Importing a document splits it: the shared guide here, each athlete's section onto that athlete.
 */
export default function CoachingGuide({ initial }: { initial: string }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [split, setSplit] = useState<SplitDoc | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  async function load(f: File | undefined) {
    if (!f) return;
    setMsg(null);
    if (f.size > 200_000) return setMsg("That file is too big.");
    const raw = await f.text();
    start(async () => {
      const r = await previewCoachingDoc(raw);
      if (!r.ok) return setMsg(r.error);
      setSplit(r.split);
    });
  }

  if (split)
    return (
      <div className="space-y-4">
        <p className="text-sm text-white/60">Check the split before saving. Each athlete&apos;s numbers go only to that athlete.</p>
        <label className="block">
          <span className="text-sm font-medium">Coaching guide (shared)</span>
          <textarea value={split.guide} onChange={(e) => setSplit({ ...split, guide: e.target.value })} rows={10} className={`${area} mt-1`} />
        </label>
        {split.athletes.map((a, i) => (
          <label key={a.id} className="block">
            <span className="text-sm font-medium">Private notes: {a.name}</span>
            <textarea value={a.notes} onChange={(e) => setSplit({ ...split, athletes: split.athletes.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)) })} rows={6} className={`${area} mt-1`} />
          </label>
        ))}
        {split.athletes.length === 0 && <p className="text-sm text-amber-100/80">No athlete sections matched your roster by name. You can add notes on each athlete&apos;s page.</p>}
        {split.review.length > 0 && (
          <div className="rounded-2xl border border-amber-200/20 bg-amber-200/[0.05] p-4 text-sm">
            <p className="font-medium text-amber-100">Not saved: these lines name more than one athlete</p>
            <p className="mt-1 text-white/55">Add the parts that matter to each athlete&apos;s notes by hand.</p>
            <ul className="mt-2 space-y-1 text-white/70">
              {split.review.map((l) => (
                <li key={l}>• {l}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveCoachingImport(split.guide, split.athletes.map((a) => ({ id: a.id, notes: a.notes })));
                if (!r.ok) return setMsg(r.error);
                setText(split.guide);
                setSaved(split.guide);
                setSplit(null);
                setMsg(r.message ?? "Saved.");
                router.refresh();
              })
            }
            className="min-h-12 rounded-2xl bg-emerald-300 px-6 font-medium text-[#0d1513] disabled:opacity-50"
          >
            Save all
          </button>
          <button onClick={() => setSplit(null)} className="min-h-12 px-3 text-sm text-white/55">
            Cancel
          </button>
          {msg && <p className="text-sm text-red-200">{msg}</p>}
        </div>
      </div>
    );

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value.slice(0, 20000));
          setMsg(null);
        }}
        rows={8}
        placeholder="Your coaching philosophy: frameworks you follow, how you build blocks, intensity rules, recovery, taper, weekly skeleton, the tone of workout names…"
        className={area}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          disabled={pending || text === saved}
          onClick={() =>
            start(async () => {
              const r = await savePhilosophy(text);
              setMsg(r.ok ? "Saved." : r.error);
              if (r.ok) setSaved(text);
            })
          }
          className="min-h-11 rounded-2xl border border-white/15 px-5 text-sm disabled:opacity-40"
        >
          Save guide
        </button>
        <input ref={file} type="file" accept=".md,.txt,.markdown,text/plain,text/markdown" className="hidden" onChange={(e) => load(e.target.files?.[0])} />
        <button onClick={() => file.current?.click()} disabled={pending} className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 px-4 text-sm text-white/75">
          <FileUp size={16} aria-hidden /> Import coaching document
        </button>
        {msg && <p className="text-sm text-white/60">{msg}</p>}
      </div>
      <p className="mt-2 text-xs text-white/40">Text or Markdown file. Sections about one athlete (by name) become that athlete&apos;s private notes.</p>
    </div>
  );
}

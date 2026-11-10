"use client";

import { BookmarkPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveAsTemplate } from "@/lib/plans/actions";

const field = "min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none";

/** Turn this athlete's weeks into a reusable plan template. */
export default function SaveAsPlan({ athleteId, today }: { athleteId: string; today: string }) {
  const router = useRouter();
  const monday = (() => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  })();
  const plus = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(monday);
  const [to, setTo] = useState(plus(monday, 16 * 7 - 1));
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 flex min-h-10 items-center gap-1.5 text-sm text-emerald-200/80 hover:underline">
        <BookmarkPlus size={15} aria-hidden /> Save as plan
      </button>
    );
  return (
    <div className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-sm text-white/70">Save these weeks as a plan you can apply to anyone. Targets become percentages of this athlete&apos;s zones.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-white/55">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`mt-1 ${field}`} />
        </label>
        <label className="text-xs text-white/55">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`mt-1 ${field}`} />
        </label>
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plan name, e.g. 16-week Ironman build" aria-label="Plan name" maxLength={120} className={field} />
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags: ironman, intermediate, 16 weeks" aria-label="Tags" className={field} />
      {err && <p className="text-sm text-red-200">{err}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={() =>
            start(async () => {
              setErr(null);
              const r = await saveAsTemplate({ athleteId, from, to, name, tags: tags.split(",") });
              if (r.ok) router.push(`/library/plans/${r.id}`);
              else setErr(r.error);
            })
          }
          className="min-h-11 rounded-xl border border-emerald-300/25 bg-emerald-300/20 px-4 text-sm font-medium text-emerald-50 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save plan"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-sm text-white/55">
          Cancel
        </button>
      </div>
    </div>
  );
}

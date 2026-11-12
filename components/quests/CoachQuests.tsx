"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { GritMark } from "@/components/grit/Art";
import { addRestQuest, removeRestQuest } from "@/lib/quests/actions";
import { CATALOG } from "@/lib/quests/quests";

type Row = { id: string; title: string; blurb: string | null; grit: number; athlete_id: string | null };
const input = "min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white placeholder:text-white/40 focus:border-emerald-300/40 focus:outline-none";

/** Coach: your own rest day quests, for everyone or one athlete. They rotate in alongside the built-in ones. */
export default function CoachQuests({ quests, athletes }: { quests: Row[]; athletes: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [who, setWho] = useState("");
  const [grit, setGrit] = useState(10);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const nameOf = (id: string | null) => (id ? (athletes.find((a) => a.id === id)?.name ?? "One athlete") : "Everyone");

  const add = () =>
    start(async () => {
      const r = await addRestQuest({ title, blurb, athleteId: who || null, grit });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setTitle("");
      setBlurb("");
      setMsg({ ok: true, text: "Added. It rotates into rest days from now on." });
      router.refresh();
    });
  const remove = (id: string) =>
    start(async () => {
      const r = await removeRestQuest(id);
      if (!r.ok) setMsg({ ok: false, text: r.error });
      router.refresh();
    });

  return (
    <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 sm:p-6" aria-labelledby="quests-h">
      <h2 id="quests-h" className="text-lg font-medium">Rest day quests</h2>
      <p className="mt-1 text-sm text-white/55">
        On days with nothing planned, athletes see 2–3 optional missions on Today. Each one earns grit; skipping costs nothing. Add your own and one rotates in each rest day.
      </p>

      {quests.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {quests.map((q) => (
            <li key={q.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{q.title}</span>
                <span className="block truncate text-xs text-white/50">
                  {nameOf(q.athlete_id)}
                  {q.blurb ? ` · ${q.blurb}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-white/55">
                <GritMark size={12} /> {q.grit}
              </span>
              <button type="button" disabled={pending} onClick={() => remove(q.id)} aria-label={`Remove ${q.title}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/45 hover:bg-white/[0.06] hover:text-white">
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="sr-only">Quest</span>
          <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Quest, e.g. Stretch on a call with your pod" className={input} />
        </label>
        <label className="sm:col-span-2">
          <span className="sr-only">Details (optional)</span>
          <input value={blurb} maxLength={140} onChange={(e) => setBlurb(e.target.value)} placeholder="A line of detail (optional)" className={input} />
        </label>
        <label>
          <span className="mb-1 block text-xs text-white/50">For</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} className={input}>
            <option value="">Everyone</option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs text-white/50">Grit</span>
          <select value={grit} onChange={(e) => setGrit(Number(e.target.value))} className={input}>
            {[5, 10, 15, 20, 25].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" disabled={pending || !title.trim()} onClick={add} className="mt-3 min-h-11 rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 text-sm font-medium text-emerald-50 transition active:scale-95 hover:bg-emerald-300/20 disabled:opacity-50">
        Add quest
      </button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-emerald-100" : "text-red-200"}`}>
          {msg.text}
        </p>
      )}
      <details className="mt-4">
        <summary className="min-h-11 cursor-pointer py-2 text-sm text-emerald-200">The built-in quests ({CATALOG.length})</summary>
        <ul className="mt-1 grid gap-1 text-sm text-white/60">
          {CATALOG.map((q) => (
            <li key={q.key}>
              <span className="text-white/85">{q.title}</span> · {q.blurb}
              {q.auto && <span className="text-white/45"> (counts itself)</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-white/45">Quests never touch food amounts, calories or weight, and aren&apos;t shown in sick or injured mode.</p>
      </details>
    </section>
  );
}

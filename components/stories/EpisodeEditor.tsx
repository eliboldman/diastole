"use client";

import { Clapperboard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { discardEpisode, draftNow, saveEpisode } from "@/lib/stories/actions";

type Draft = { id: string; title: string; body: string; episode: number; season: number; week: string } | null;

/** Coach: this week's episode. Drafted by the assistant in your voice; nothing posts until you do. */
export default function EpisodeEditor({ podId, draft, posted }: { podId: string; draft: Draft; posted: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(draft?.title ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [prev, setPrev] = useState(draft);
  if (prev !== draft) {
    setPrev(draft);
    setTitle(draft?.title ?? "");
    setBody(draft?.body ?? "");
  }
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (f: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await f();
      setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error ?? "Couldn't do that." });
      router.refresh();
    });

  return (
    <section id="episode" className="mt-6 scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Clapperboard size={18} className="text-emerald-200" aria-hidden /> This week&apos;s episode
      </h2>
      <p className="mt-1 text-sm text-white/55">A short recap of last week, drafted in your voice from what each athlete shares with the pod (never health, weight or food). Edit anything; the pod only sees it when you post.</p>
      {draft ? (
        <div className="mt-4 grid gap-2">
          <p className="text-xs text-white/45">
            Season {draft.season} · Episode {draft.episode} · week of {new Date(`${draft.week}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
          <input value={title} maxLength={90} onChange={(e) => setTitle(e.target.value)} aria-label="Title" className="min-h-11 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-lg font-medium text-white focus:border-emerald-300/40 focus:outline-none" />
          <textarea value={body} maxLength={3000} rows={9} onChange={(e) => setBody(e.target.value)} aria-label="Episode" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 leading-relaxed text-white focus:border-emerald-300/40 focus:outline-none" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => saveEpisode(draft.id, title, body, true), "Posted to the pod.")} className="min-h-11 rounded-xl bg-emerald-300 px-5 text-sm font-medium text-black transition active:scale-95 disabled:opacity-50">
              Post to the pod
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => saveEpisode(draft.id, title, body, false), "Saved.")} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-white/80 hover:bg-white/[0.06]">
              Save draft
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => draftNow(podId), "Redrafted.")} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm text-white/65 hover:bg-white/[0.06]">
              Redraft
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => discardEpisode(draft.id), "Skipped this week.")} className="min-h-11 px-3 text-sm text-white/50 hover:text-white">
              Skip this week
            </button>
          </div>
        </div>
      ) : posted ? (
        <p className="mt-3 text-sm text-emerald-100/90">Last week&apos;s episode is posted. The next draft arrives Monday evening.</p>
      ) : (
        <button type="button" disabled={pending} onClick={() => run(() => draftNow(podId), "Draft ready.")} className="mt-4 min-h-11 rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 text-sm font-medium text-emerald-50 disabled:opacity-50">
          {pending ? "Drafting…" : "Draft last week's episode"}
        </button>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-emerald-100" : "text-red-200"}`}>{msg.text}</p>}
    </section>
  );
}

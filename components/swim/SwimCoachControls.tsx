"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveSwimNote, setDrill } from "@/lib/swim/actions";

export function DrillButtons({ athleteId, drill, mode }: { athleteId: string; drill: string; mode: "suggested" | "focus" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (a: "approve" | "remove" | "dismiss") =>
    start(async () => {
      await setDrill(athleteId, drill, a);
      router.refresh();
    });
  if (mode === "focus")
    return (
      <button type="button" disabled={pending} onClick={() => act("remove")} className="min-h-11 shrink-0 rounded-xl px-2 text-xs text-white/45 hover:text-red-300 disabled:opacity-40">
        Remove
      </button>
    );
  return (
    <span className="flex shrink-0 gap-1">
      <button type="button" disabled={pending} onClick={() => act("approve")} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 text-xs text-emerald-50 disabled:opacity-40">
        <Check size={13} aria-hidden /> Approve
      </button>
      <button type="button" disabled={pending} onClick={() => act("dismiss")} aria-label="Dismiss suggestion" className="flex h-11 w-11 items-center justify-center rounded-xl text-white/45 hover:text-white disabled:opacity-40">
        <X size={14} />
      </button>
    </span>
  );
}

export function SwimNoteForm({ athleteId, note, videoAsked }: { athleteId: string; note: string; videoAsked: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(note);
  const [video, setVideo] = useState(videoAsked);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-4 grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveSwimNote(athleteId, text, video);
          setMsg(r.ok ? "Saved." : "Couldn't save.");
          router.refresh();
        });
      }}
    >
      <label className="text-xs text-white/55" htmlFor="swim-note">
        Note with the drills (the athlete sees it)
      </label>
      <textarea id="swim-note" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={2} placeholder="e.g. Drills in every warm-up this week, then we'll look again." className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[16px] text-white placeholder:text-white/30 focus:border-emerald-300/40 focus:outline-none" />
      <label className="flex min-h-11 items-center gap-2 text-sm text-white/75">
        <input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} className="h-5 w-5 accent-emerald-300" />
        Ask for a stroke video (shows a short filming guide)
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending || (text === note && video === videoAsked)} className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-medium text-black disabled:opacity-40">
          {pending ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-xs text-white/55">{msg}</span>}
      </div>
    </form>
  );
}

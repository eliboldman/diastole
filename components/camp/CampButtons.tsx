"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelCamp, declineCamp, joinCamp, leaveCamp, saveCampMessage } from "@/lib/camp/actions";

/** Join / not this time / step out, with the result in words. */
export function CampChoice({ campId, status, over }: { campId: string; status: "joined" | "declined" | "left" | null; over: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" });
      if (r.ok) router.refresh();
    });
  if (over) return null;
  return (
    <div>
      {status === "joined" ? (
        confirmLeave ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-white/70">Step out? Sessions from today come off your calendar; what you did still counts.</span>
            <button type="button" disabled={pending} onClick={() => run(() => leaveCamp(campId))} className="min-h-11 rounded-xl border border-white/15 px-3 text-white/80 disabled:opacity-40">
              {pending ? "…" : "Step out"}
            </button>
            <button type="button" onClick={() => setConfirmLeave(false)} className="min-h-11 rounded-xl px-3 text-white/55">
              Stay in
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmLeave(true)} className="min-h-11 text-sm text-white/45 hover:text-white">
            Life happened? Step out of the camp
          </button>
        )
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => run(() => joinCamp(campId))} className="min-h-12 rounded-2xl bg-emerald-300 px-5 text-sm font-medium text-black transition active:scale-[0.98] disabled:opacity-50">
            {pending ? "Adding your sessions…" : status === "left" ? "Rejoin the camp" : "Join the camp"}
          </button>
          {status === null && (
            <button type="button" disabled={pending} onClick={() => run(() => declineCamp(campId))} className="min-h-12 rounded-2xl border border-white/15 px-4 text-sm text-white/70 disabled:opacity-50">
              Not this time
            </button>
          )}
        </div>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-200" : "text-red-200"}`}>{msg.text}</p>}
    </div>
  );
}

export function CampMessageForm({ campId, date, initial, min, max }: { campId: string; date: string; initial: string; min: string; max: string }) {
  const router = useRouter();
  const [day, setDay] = useState(date);
  const [text, setText] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveCampMessage(campId, day, text);
          setMsg(r.ok ? (r.message ?? "Saved.") : r.error);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-white/55" htmlFor="camp-day">
          Message for
        </label>
        <input id="camp-day" type="date" value={day} min={min} max={max} onChange={(e) => setDay(e.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[16px] text-white [color-scheme:dark]" />
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={600} rows={3} placeholder="Today's focus, a story, a nudge. Everyone in the camp sees it." aria-label="Camp message" className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[16px] text-white placeholder:text-white/30 focus:border-emerald-300/40 focus:outline-none" />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-medium text-black disabled:opacity-40">
          {pending ? "Posting…" : "Post"}
        </button>
        {msg && <span className="text-xs text-white/55">{msg}</span>}
      </div>
    </form>
  );
}

export function CancelCamp({ campId, back }: { campId: string; back: string }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  return sure ? (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-white/65">Cancel it? Members&apos; upcoming camp sessions come off their calendars.</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await cancelCamp(campId);
            router.push(back);
          })
        }
        className="min-h-11 rounded-xl border border-red-300/30 px-3 text-red-200 disabled:opacity-40"
      >
        {pending ? "Cancelling…" : "Cancel camp"}
      </button>
      <button type="button" onClick={() => setSure(false)} className="min-h-11 px-2 text-white/55">
        Keep it
      </button>
    </span>
  ) : (
    <button type="button" onClick={() => setSure(true)} className="min-h-11 text-sm text-white/45 hover:text-red-300">
      Cancel camp
    </button>
  );
}

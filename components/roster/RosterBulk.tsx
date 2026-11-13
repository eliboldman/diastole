"use client";

import { CheckSquare, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { inviteToPod } from "@/lib/pods";
import { bulkMessage } from "@/lib/roster-actions";

/** Pick several athletes, then message them all, add them to a pod, or apply a plan. */
export default function RosterBulk({ athletes, pods }: { athletes: { id: string; name: string }[]; pods: { id: string; name: string }[] }) {
  const [on, setOn] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"message" | "pod" | null>(null);
  const [text, setText] = useState("");
  const [pod, setPod] = useState(pods[0]?.id ?? "");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const ids = [...picked];
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (!on) {
    return (
      <button type="button" onClick={() => setOn(true)} className="mt-6 flex min-h-11 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] px-4 text-sm text-white/80 hover:bg-white/[0.08]">
        <CheckSquare size={16} aria-hidden /> Select athletes
      </button>
    );
  }
  return (
    <section className="mt-6 rounded-[24px] border border-emerald-300/20 bg-emerald-300/[0.05] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{picked.size ? `${picked.size} selected` : "Pick athletes"}</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPicked(picked.size === athletes.length ? new Set() : new Set(athletes.map((a) => a.id)))} className="min-h-10 rounded-xl px-3 text-sm text-emerald-200 hover:bg-white/[0.05]">
            {picked.size === athletes.length ? "None" : "All"}
          </button>
          <button type="button" aria-label="Done selecting" onClick={() => { setOn(false); setPicked(new Set()); setMode(null); setNote(null); }} className="flex h-10 w-10 items-center justify-center rounded-xl text-white/60 hover:bg-white/[0.05]">
            <X size={16} />
          </button>
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {athletes.map((a) => (
          <li key={a.id}>
            <button type="button" aria-pressed={picked.has(a.id)} onClick={() => toggle(a.id)} className={`min-h-10 rounded-full border px-3 text-sm transition ${picked.has(a.id) ? "border-emerald-300/50 bg-emerald-300/20 text-emerald-50" : "border-white/15 text-white/70 hover:bg-white/[0.05]"}`}>
              {a.name}
            </button>
          </li>
        ))}
      </ul>
      {picked.size > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode(mode === "message" ? null : "message")} className="min-h-11 rounded-2xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950">Message</button>
          {pods.length > 0 && <button type="button" onClick={() => setMode(mode === "pod" ? null : "pod")} className="min-h-11 rounded-2xl border border-white/15 px-4 text-sm text-white/85 hover:bg-white/[0.06]">Add to pod</button>}
          <Link href="/library#plans" onClick={() => { try { sessionStorage.setItem("d_plan_athletes", JSON.stringify(ids)); } catch {} }} className="flex min-h-11 items-center rounded-2xl border border-white/15 px-4 text-sm text-white/85 hover:bg-white/[0.06]">Apply a plan →</Link>
        </div>
      )}
      {mode === "message" && picked.size > 0 && (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await bulkMessage(ids, text);
              if (!r.ok) setNote({ ok: false, text: r.error });
              else { setNote({ ok: true, text: `Sent to ${r.sent}${r.failed ? ` (${r.failed} failed)` : ""}. Each gets it in their own chat.` }); setText(""); setMode(null); }
            });
          }}
        >
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder={`Message ${picked.size} athlete${picked.size === 1 ? "" : "s"} (each in their own chat)`} className="w-full rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white placeholder:text-white/35 focus:outline-none" />
          <button disabled={pending || !text.trim()} className="mt-2 min-h-11 rounded-2xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 disabled:opacity-50">{pending ? "Sending…" : "Send"}</button>
        </form>
      )}
      {mode === "pod" && picked.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={pod} onChange={(e) => setPod(e.target.value)} aria-label="Pod" className="min-h-11 rounded-2xl border border-white/15 bg-panel px-3 text-sm">
            {pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            disabled={pending}
            onClick={() => start(async () => {
              const r = await inviteToPod(pod, ids);
              setNote(r.ok ? { ok: true, text: "Invited. They join once they accept." } : { ok: false, text: r.error ?? "Couldn't invite." });
              if (r.ok) setMode(null);
            })}
            className="min-h-11 rounded-2xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 disabled:opacity-50"
          >
            Invite to pod
          </button>
        </div>
      )}
      {note && <p className={`mt-3 text-sm ${note.ok ? "text-emerald-100" : "text-red-200"}`}>{note.text}</p>}
    </section>
  );
}

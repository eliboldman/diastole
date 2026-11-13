"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { decideInbox } from "@/lib/inbox/actions";
import type { InboxItem, InboxType } from "@/lib/inbox/data";

const LABEL: Record<InboxType, { kind: string; yes: string; no: string }> = {
  suggestion: { kind: "AI suggestion", yes: "Approve", no: "Dismiss" },
  boss: { kind: "Boss", yes: "Approve", no: "Skip" },
  plan_change: { kind: "Plan change", yes: "Approve", no: "Decline" },
  request: { kind: "Workout request", yes: "Add it", no: "Decline" },
  strength: { kind: "Strength", yes: "Apply", no: "Dismiss" },
  brief: { kind: "Morning message", yes: "Send", no: "Skip" },
  episode: { kind: "Pod episode", yes: "Post", no: "Discard" },
};

/** Everything waiting on the coach. Keys: j/k to move, a to approve, d to dismiss, o to open. */
export default function InboxList({ initial }: { initial: InboxItem[] }) {
  const [items, setItems] = useState(initial);
  const [sel, setSel] = useState(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const decide = (it: InboxItem, yes: boolean) =>
    start(async () => {
      setError(null);
      const r = await decideInbox(it.type, it.id, yes, { body: it.body, title: it.extra?.title });
      if (!r.ok) setError(r.error ?? "That didn't work.");
      else setItems((xs) => xs.filter((x) => x.id !== it.id));
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const it = items[Math.min(sel, items.length - 1)];
      if (e.key === "j") setSel((s) => Math.min(items.length - 1, s + 1));
      else if (e.key === "k") setSel((s) => Math.max(0, s - 1));
      else if (it && e.key === "a" && !pending) decide(it, true);
      else if (it && e.key === "d" && !pending) decide(it, false);
      else if (it && e.key === "o") window.location.href = it.href;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!items.length) return <p className="mt-8 max-w-3xl rounded-[24px] border border-white/10 bg-white/[0.05] p-6 text-white/60">All caught up. Nothing is waiting on you.</p>;

  return (
    <div className="mt-6 max-w-3xl">
      {error && <p className="mb-3 rounded-2xl border border-red-300/20 bg-red-300/[0.06] p-3 text-sm text-red-200">{error}</p>}
      <p className="mb-3 hidden text-xs text-white/40 md:block">Keys: j / k to move · a approve · d dismiss · o open</p>
      <ul className="space-y-3">
        {items.map((it, i) => {
          const L = LABEL[it.type];
          const active = i === Math.min(sel, items.length - 1);
          return (
            <li key={it.type + it.id} onClick={() => setSel(i)} className={`rounded-[24px] border p-4 transition ${active ? "border-emerald-300/30 bg-white/[0.07]" : "border-white/10 bg-white/[0.04]"}`}>
              <p className="text-xs uppercase tracking-[0.15em] text-white/45">
                {L.kind} · {it.who}
              </p>
              <p className="mt-1 font-medium">{it.title}</p>
              {it.detail && <p className="mt-1 text-sm text-white/60">{it.detail}</p>}
              {it.body && (
                <button type="button" onClick={() => setOpen(open === it.id ? null : it.id)} className="mt-1 min-h-10 text-sm text-emerald-200 hover:underline">
                  {open === it.id ? "Hide" : "Read it"}
                </button>
              )}
              {it.body && open === it.id && <p className="mt-1 whitespace-pre-wrap rounded-2xl bg-black/20 p-3 text-sm text-white/75">{it.body}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button disabled={pending} onClick={() => decide(it, true)} className="min-h-11 rounded-2xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 active:scale-95 disabled:opacity-50">
                  {L.yes}
                </button>
                <button disabled={pending} onClick={() => decide(it, false)} className="min-h-11 rounded-2xl border border-white/15 px-4 text-sm text-white/75 hover:bg-white/[0.06] disabled:opacity-50">
                  {L.no}
                </button>
                <Link href={it.href} className="ml-auto min-h-11 px-2 py-3 text-sm text-white/55 hover:text-white">
                  {it.type === "brief" || it.type === "episode" ? "Edit first →" : "Open →"}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

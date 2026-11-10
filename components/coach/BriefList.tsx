"use client";

import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import AvatarCircle from "@/components/avatar/AvatarCircle";
import { draftBriefsNow, sendBrief, skipBrief } from "@/lib/ai/brief-actions";

export type BriefItem = {
  id: string;
  athlete_id: string;
  date: string;
  draft: string;
  status: string;
  final_text: string | null;
  decided_at: string | null;
  name: string;
  look: unknown;
};

function Brief({ b }: { b: BriefItem }) {
  const router = useRouter();
  const [text, setText] = useState(b.final_text ?? b.draft);
  const [state, setState] = useState(b.status);
  const [conv, setConv] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = b.name.split(" ")[0];

  if (state !== "pending")
    return (
      <li className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
        <AvatarCircle look={b.look} name={b.name} size={32} />
        <span className="min-w-0 flex-1 truncate text-sm text-white/70">{b.name}</span>
        {state === "sent" ? (
          <span className="flex items-center gap-1.5 text-sm text-emerald-200">
            <Check size={15} /> Sent
            {conv && (
              <Link href={`/messages/${conv}`} className="ml-2 text-white/55 hover:text-white hover:underline">
                Open chat →
              </Link>
            )}
          </span>
        ) : (
          <span className="text-sm text-white/45">Skipped</span>
        )}
      </li>
    );

  return (
    <li className="row-in rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center gap-3">
        <AvatarCircle look={b.look} name={b.name} size={36} />
        <span className="font-medium">{b.name}</span>
      </div>
      <textarea
        value={text}
        rows={4}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
        aria-label={`Brief for ${b.name}`}
        className="w-full resize-y rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base leading-relaxed text-white focus:border-emerald-300/40 focus:outline-none sm:text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await sendBrief(b.id, text);
              if (!r.ok) return setError(r.error);
              navigator.vibrate?.([8, 30, 8]);
              setConv(r.conversationId);
              setState("sent");
              router.refresh();
            })
          }
          className="flex min-h-11 items-center gap-2 rounded-full bg-emerald-300 px-5 text-sm font-medium text-black transition hover:bg-emerald-200 disabled:opacity-50"
        >
          {pending ? "Sending…" : `Send to ${first}`}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await skipBrief(b.id);
              if (r.ok) setState("skipped");
              router.refresh();
            })
          }
          className="min-h-11 rounded-full px-4 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white"
        >
          Skip
        </button>
        {error && (
          <span role="alert" className="text-sm text-red-200">
            {error}
          </span>
        )}
      </div>
    </li>
  );
}

export default function BriefList({ items }: { items: BriefItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const draft = () =>
    start(async () => {
      setNote(null);
      const r = await draftBriefsNow();
      setNote(r.status === "done" ? `Drafted ${r.drafted} (${r.costUsd < 0.01 ? "under 1¢" : `${(r.costUsd * 100).toFixed(1)}¢`}).` : r.reason);
      router.refresh();
    });
  const pendingCount = items.filter((i) => i.status === "pending").length;
  return (
    <div>
      {items.length > 0 && (
        <ul className="grid gap-2">
          {items.map((b) => (
            <Brief key={b.id} b={b} />
          ))}
        </ul>
      )}
      {pendingCount === 0 && (
        <div className={items.length ? "mt-3" : ""}>
          <button
            type="button"
            onClick={draft}
            disabled={pending}
            className="flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-sm text-white/80 transition hover:bg-white/[0.09] disabled:opacity-60"
          >
            <Sparkles size={15} className={pending ? "animate-pulse text-amber-200" : "text-amber-200"} />
            {pending ? "Drafting…" : items.length ? "Draft any missing briefs" : "Draft today's briefs"}
          </button>
          <p className="mt-2 text-xs text-white/40">{note ?? "Or use Review on the Morning review card once athletes' overnight data is in."}</p>
        </div>
      )}
    </div>
  );
}

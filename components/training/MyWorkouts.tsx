"use client";

import { Bike, Check, Copy, FileUp, Footprints, Pencil, Send, Trash2, Waves, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelRequest, deleteMyWorkout, importMyWorkouts, requestWorkout } from "@/lib/workouts/athlete-actions";
import type { Pool, Sport, Step } from "@/lib/workouts/garmin-format";

type Item = { id: string; title: string; sport: string; description: string | null; steps: Step[]; pool: Pool; lines: string[] };
type Request = { id: string; title: string; sport: string; date: string; declined: boolean };

const icon = (sport: string) => (sport === "bike" ? Bike : sport === "swim" ? Waves : Footprints);
const when = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const plus = (today: string, n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The athlete's library, their requests, and import. Kept to one column of simple rows. */
export default function MyWorkouts({ items, requests, today, hasCoach, prompt }: { items: Item[]; requests: Request[]; today: string; hasCoach: boolean; prompt: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState<string | null>(null);
  const [date, setDate] = useState(plus(today, 1));
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [json, setJson] = useState("");
  const [askDated, setAskDated] = useState(true);
  const [copied, setCopied] = useState(false);

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setNote(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Something went wrong." });
      if (r.ok) after?.();
      router.refresh();
    });

  return (
    <div className="mt-6 space-y-8">
      {note && (
        <p role="status" className={`rounded-2xl border p-3 text-sm ${note.ok ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100" : "border-amber-200/20 bg-amber-200/[0.05] text-amber-100"}`}>
          {note.text}
        </p>
      )}

      {requests.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm uppercase tracking-[0.15em] text-white/50">Asked your coach</h2>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className={`text-xs ${r.declined ? "text-amber-200/80" : "text-white/50"}`}>
                    {when(r.date)} · {r.declined ? "Your coach passed on this one" : "Waiting for your coach"}
                  </p>
                </div>
                <button type="button" disabled={pending} onClick={() => act(() => cancelRequest(r.id))} className="min-h-11 rounded-xl px-3 text-sm text-white/55 hover:bg-white/[0.06]">
                  {r.declined ? "Clear" : "Cancel"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm uppercase tracking-[0.15em] text-white/50">Saved</h2>
        {!items.length ? (
          <p className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-white/55">Nothing saved yet. Build one, or import a set below.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((w) => {
              const Icon = icon(w.sport);
              return (
                <li key={w.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Icon size={18} className="mt-0.5 shrink-0 text-white/50" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium leading-snug">{w.title}</p>
                      <p className="truncate text-xs text-white/50">{w.lines.slice(0, 2).join(" · ")}</p>
                    </div>
                    <Link href={`/training/mine/${w.id}`} aria-label={`Edit ${w.title}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/50 hover:bg-white/[0.06] hover:text-white">
                      <Pencil size={16} />
                    </Link>
                    {confirmDelete === w.id ? (
                      <button type="button" disabled={pending} onClick={() => act(() => deleteMyWorkout(w.id), () => setConfirmDelete(null))} className="min-h-10 shrink-0 rounded-xl bg-rose-300/15 px-3 text-sm text-rose-100">
                        Delete
                      </button>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelete(w.id)} aria-label={`Delete ${w.title}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/40 hover:bg-white/[0.06] hover:text-white/80">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  {hasCoach &&
                    (asking === w.id ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} aria-label="Date" className="min-h-11 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-base sm:text-sm" />
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => act(() => requestWorkout({ title: w.title, sport: w.sport as Sport, description: w.description ?? "", steps: w.steps, pool: w.pool, date }), () => setAsking(null))}
                          className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-300 px-4 text-sm font-medium text-black disabled:opacity-60"
                        >
                          <Send size={15} aria-hidden /> Ask coach
                        </button>
                        <button type="button" onClick={() => setAsking(null)} aria-label="Cancel" className="flex h-11 w-11 items-center justify-center rounded-xl text-white/50 hover:bg-white/[0.06]">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setAsking(w.id)} className="mt-2 min-h-10 text-sm text-emerald-200 hover:underline">
                        Ask coach to add it →
                      </button>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details className="group rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-sm font-medium">
          <FileUp size={16} className="text-white/55" aria-hidden /> Import from JSON
          <span className="ml-auto text-xs font-normal text-white/45 group-open:hidden">For sets written by an AI chat</span>
        </summary>
        <div className="space-y-3 pb-4">
          <p className="text-sm text-white/60">Copy the prompt into ChatGPT, Claude or any AI chat, describe what you want (e.g. &ldquo;a 4-week 10K block, 4 runs a week&rdquo;), then paste its answer here.</p>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(prompt);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setNote({ ok: false, text: "Couldn't copy. Long-press to copy the prompt instead." });
              }
            }}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm hover:bg-white/[0.06]"
          >
            {copied ? <Check size={15} className="text-emerald-300" aria-hidden /> : <Copy size={15} aria-hidden />} {copied ? "Copied" : "Copy prompt for your AI"}
          </button>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder='Paste JSON here: { "workouts": [ ... ] }'
            className="min-h-32 w-full rounded-xl border border-white/10 bg-white/[0.05] p-3 font-mono text-sm placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none"
          />
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-white/70">
            <input type="file" accept="application/json,.json" className="sr-only" onChange={async (e) => setJson((await e.target.files?.[0]?.text()) ?? "")} />
            <span className="rounded-xl border border-white/15 px-3 py-2">Or choose a .json file</span>
          </label>
          {hasCoach && (
            <label className="flex min-h-11 items-center gap-3 text-sm text-white/70">
              <input type="checkbox" checked={askDated} onChange={(e) => setAskDated(e.target.checked)} className="h-5 w-5 accent-emerald-300" />
              Ask my coach to add the ones with dates
            </label>
          )}
          <button
            type="button"
            disabled={!json.trim() || pending}
            onClick={() =>
              start(async () => {
                const r = await importMyWorkouts(json, hasCoach && askDated);
                if (!r.ok) return setNote({ ok: false, text: r.error });
                const head = `Imported ${r.saved} workout${r.saved === 1 ? "" : "s"}${r.asked ? `, ${r.asked} sent to your coach` : ""}.`;
                setNote({ ok: r.errors.length === 0, text: r.errors.length ? `${head} Skipped: ${r.errors.slice(0, 3).join(" · ")}` : head });
                if (r.saved) setJson("");
                router.refresh();
              })
            }
            className="min-h-12 w-full rounded-2xl bg-emerald-300 font-medium text-black disabled:bg-white/10 disabled:text-white/40"
          >
            {pending ? "Importing…" : "Import"}
          </button>
        </div>
      </details>
    </div>
  );
}

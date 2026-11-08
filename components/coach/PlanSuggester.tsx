"use client";

import { Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const HORIZONS = [
  [1, "1 day"],
  [7, "1 week"],
  [14, "2 weeks"],
  [28, "4 weeks"],
] as const;

const tomorrow = () => {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "Suggest workouts": Claude drafts up to four weeks from your guide and this athlete's data; you approve. */
export default function PlanSuggester({ athleteId, firstName, ready }: { athleteId: string; firstName: string; ready: { guide: boolean; notes: boolean; week: boolean } }) {
  const router = useRouter();
  const [days, setDays] = useState<number>(7);
  const [start, setStart] = useState("");
  const [guidance, setGuidance] = useState("");
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setStart((s) => s || tomorrow()), 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function go() {
    if (!ready.guide) return setMsg({ ok: false, text: "guide" });
    if (!start) return setMsg({ ok: false, text: "Pick a start date." });
    setBusy(true);
    setElapsed(0);
    setMsg(null);
    try {
      const res = await fetch("/api/ai/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ athleteId, start, days, guidance, replaceDrafts: replace }) });
      const r = await res.json().catch(() => ({ ok: false, error: "That took too long. Try a shorter window." }));
      if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Something went wrong." });
      setMsg({ ok: true, text: `${r.created} draft workout${r.created === 1 ? "" : "s"} added for review${r.dropped?.length ? ` (${r.dropped.length} skipped: didn't pass the watch checks)` : ""}. Cost about $${Number(r.costUsd).toFixed(2)}.` });
      router.refresh();
      setTimeout(() => document.getElementById("suggestions")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    } catch {
      setMsg({ ok: false, text: "No connection. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const missing = [!ready.guide && "your coaching guide (Me → Coaching assistant)", !ready.notes && `notes on ${firstName}`, !ready.week && `${firstName}'s preferred week`].filter(Boolean) as string[];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {HORIZONS.map(([d, label]) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={`min-h-11 rounded-2xl border px-4 text-sm ${days === d ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50" : "border-white/10 text-white/65"}`}>
            {label}
          </button>
        ))}
        <label className="flex items-center gap-2 text-sm text-white/55">
          from
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[16px] text-white focus:border-emerald-300/40 focus:outline-none" />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="text-sm text-white/60">Anything to plan around? (optional)</span>
        <textarea
          value={guidance}
          onChange={(e) => setGuidance(e.target.value.slice(0, 2000))}
          rows={3}
          placeholder={`e.g. Century ride on the 21st. Road trip Dec 5–7, no bike. Keep Tuesdays short, ${firstName} has exams.`}
          className="mt-1 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[16px] placeholder:text-white/30 focus:border-emerald-300/40 focus:outline-none"
        />
      </label>
      <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-white/60">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-4 w-4 accent-emerald-300" />
        Replace earlier suggestions in these dates that I haven&apos;t approved
      </label>
      {missing.length > 0 && <p className="mt-1 text-xs text-amber-100/70">Better with: {missing.join(", ")}.</p>}
      <button onClick={go} disabled={busy} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 font-medium text-black disabled:opacity-50 sm:w-auto sm:px-6">
        {busy ? (
          <>
            <Loader2 size={18} className="animate-spin" aria-hidden /> Planning {days === 1 ? "the day" : `${days / 7 >= 1 ? days / 7 : days} ${days >= 7 ? (days === 7 ? "week" : "weeks") : "days"}`}… {elapsed}s
          </>
        ) : (
          <>
            <Sparkles size={18} aria-hidden /> Suggest workouts
          </>
        )}
      </button>
      {busy && days >= 14 && <p className="mt-2 text-xs text-white/45">A {days / 7}-week block takes a minute or two. Keep this page open.</p>}
      {msg?.text === "guide" ? (
        <p className="mt-3 text-sm text-amber-100">
          Add your coaching guide first: every suggestion follows it.{" "}
          <Link href="/account/settings#coaching" className="font-medium text-emerald-200 underline">
            Me → Coaching assistant
          </Link>
        </p>
      ) : (
        msg && <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-200" : "text-red-200"}`}>{msg.text}</p>
      )}
      <p className="mt-3 text-xs text-white/40">Everything arrives as drafts. Nothing goes to {firstName} or the watch until you approve it.</p>
    </div>
  );
}

"use client";

import { Award, EyeOff, Flame, Mountain, PenLine, Quote, Repeat, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addOwnEntry, setEntryHidden } from "@/lib/confidence/actions";
import type { BankEntry } from "@/lib/confidence/data";
import { haptic } from "@/lib/haptics";

const ICON = { long: Mountain, brick: Repeat, pr: Award, tough: Flame, praise: Quote, note: PenLine, own: Sparkles } as const;
const GROUP: Record<BankEntry["kind"], string> = { pr: "PRs & gains", long: "Gone long", brick: "Bricks", tough: "Tough days, done anyway", praise: "From your coach", note: "In your words", own: "Yours" };
const ORDER: BankEntry["kind"][] = ["own", "praise", "pr", "tough", "long", "brick", "note"];

/** The bank: grouped proof, newest first. Add your own; hide anything you'd rather not see. */
export default function BankList({ entries, today }: { entries: BankEntry[]; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [date, setDate] = useState(today);
  const [showHidden, setShowHidden] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const visible = entries.filter((e) => showHidden || !e.hidden);
  const add = () =>
    start(async () => {
      const r = await addOwnEntry(title, detail, date);
      if (!r.ok) return setMsg(r.error);
      haptic("success");
      setTitle("");
      setDetail("");
      setMsg("In the bank.");
      router.refresh();
    });
  const toggle = (e: BankEntry) =>
    start(async () => {
      await setEntryHidden(e.id, !e.hidden);
      router.refresh();
    });

  return (
    <>
      <details className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.05] p-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium">
          <Sparkles size={16} className="text-emerald-200" aria-hidden /> Add your own
        </summary>
        <div className="mt-3 grid gap-2">
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ran the last mile of the long run fastest" aria-label="What happened" className="min-h-11 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white placeholder:text-white/40 focus:border-emerald-300/40 focus:outline-none" />
          <textarea value={detail} maxLength={400} rows={2} onChange={(e) => setDetail(e.target.value)} placeholder="How it felt (optional)" aria-label="Details" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-white placeholder:text-white/40 focus:border-emerald-300/40 focus:outline-none" />
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Date" className="min-h-11 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white" />
            <button type="button" disabled={pending || !title.trim()} onClick={add} className="min-h-11 rounded-xl bg-emerald-300 px-5 text-sm font-medium text-black disabled:opacity-50">
              Save
            </button>
            {msg && <span role="status" className="text-sm text-emerald-100">{msg}</span>}
          </div>
        </div>
      </details>

      {ORDER.map((k) => {
        const list = visible.filter((e) => e.kind === k);
        if (!list.length) return null;
        const Icon = ICON[k];
        return (
          <section key={k} className="mt-6">
            <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-[0.2em] text-white/45">
              <Icon size={13} aria-hidden /> {GROUP[k]}
            </h2>
            <ul className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.05]">
              {list.map((e, i) => (
                <li key={e.id} className={`flex items-start gap-3 px-4 py-3 ${i ? "border-t border-white/[0.08]" : ""} ${e.hidden ? "opacity-45" : ""}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{e.title}</span>
                    {e.detail && <span className={`block text-sm ${k === "praise" || k === "note" ? "italic text-white/75" : "text-white/55"}`}>{k === "praise" || k === "note" ? `“${e.detail}”` : e.detail}</span>}
                    <span className="block text-xs text-white/40">{new Date(`${e.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  </span>
                  <button type="button" disabled={pending} onClick={() => toggle(e)} aria-label={e.hidden ? "Show again" : "Hide"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/40 hover:bg-white/[0.06] hover:text-white">
                    <EyeOff size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {entries.some((e) => e.hidden) && (
        <button type="button" onClick={() => setShowHidden((v) => !v)} className="mt-4 min-h-11 text-sm text-white/50 hover:text-white">
          {showHidden ? "Hide hidden ones" : `Show hidden (${entries.filter((e) => e.hidden).length})`}
        </button>
      )}
    </>
  );
}

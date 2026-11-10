"use client";

import { ArrowRightLeft, CalendarCheck, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { applyTemplate, previewApply, type Preview } from "@/lib/plans/actions";

const day = (d: string, o: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });

/** Apply a plan: athletes, race or start date, a preview of every dated session, then create. */
export default function ApplyPlan({ planId, raceWeek, weeks, athletes }: { planId: string; raceWeek: boolean; weeks: number; athletes: { id: string; name: string }[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<"race" | "start">("race");
  const [date, setDate] = useState("");
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [send, setSend] = useState(false);
  const [pending, start] = useTransition();
  const dates = mode === "race" ? { raceDate: date } : { startDate: date };

  const toggle = (id: string) => {
    setPreviews(null);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  return (
    <section id="apply" className="mt-8 scroll-mt-6 rounded-[28px] border border-emerald-300/20 bg-emerald-300/[0.04] p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <CalendarCheck size={18} className="text-emerald-200" aria-hidden /> Apply to athletes
      </h2>
      <p className="mt-1 text-sm text-white/60">Targets are worked out from each athlete&apos;s zones, and sessions move to days that fit their week. You&apos;ll see everything before anything is created.</p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Athletes">
        {athletes.map((a) => (
          <button key={a.id} type="button" aria-pressed={picked.includes(a.id)} onClick={() => toggle(a.id)} className={`min-h-10 rounded-full border px-3 text-sm ${picked.includes(a.id) ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50" : "border-white/10 text-white/70"}`}>
            {a.name}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex rounded-xl bg-white/[0.05] p-1" role="radiogroup" aria-label="Line up by">
          {(["race", "start"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setPreviews(null); }} className={`min-h-9 rounded-lg px-3 text-sm ${mode === m ? "bg-emerald-300/20 text-emerald-50" : "text-white/60"}`}>
              {m === "race" ? "Race date" : "Start date"}
            </button>
          ))}
        </div>
        <label className="text-sm text-white/60">
          <span className="sr-only">{mode === "race" ? "Race date" : "Start date"}</span>
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPreviews(null); }} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white" />
        </label>
        <button
          type="button"
          disabled={pending || !picked.length || !date}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await previewApply(planId, picked, dates);
              if (r.ok) setPreviews(r.previews);
              else setMsg({ ok: false, text: r.error });
            })
          }
          className="min-h-11 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm font-medium hover:bg-white/[0.1] disabled:opacity-40"
        >
          {pending && !previews ? "Working it out…" : "Preview"}
        </button>
      </div>
      <p className="mt-2 text-xs text-white/45">
        {mode === "race" ? (raceWeek ? `The ${weeks}-week plan ends with race week.` : `The ${weeks}-week plan ends the week before race week.`) : `Week 1 starts on the Monday of that week.`}
      </p>

      {previews && (
        <div className="mt-5 space-y-4">
          {previews.map((p) => (
            <div key={p.athleteId} className="rounded-2xl border border-white/10 bg-canvas/40 p-4">
              <p className="font-medium">
                {p.name} <span className="font-normal text-white/50">· {day(p.start, { month: "short", day: "numeric" })} – {day(p.end, { month: "short", day: "numeric", year: "numeric" })}</span>
              </p>
              <p className="mt-0.5 text-xs text-white/55">
                {p.items.length - p.past} session{p.items.length - p.past === 1 ? "" : "s"}
                {p.moved ? ` · ${p.moved} moved to fit their week` : ""}
                {p.past ? ` · ${p.past} in the past, skipped` : ""}
              </p>
              {p.missing.length > 0 && <p className="mt-1 text-xs text-amber-100/80">No {p.missing.join(" or ")} in their zones: those targets stay as written.</p>}
              <details className="mt-2">
                <summary className="inline-flex min-h-10 cursor-pointer items-center text-sm text-emerald-200/80">See every session</summary>
                <ol className="mt-1 max-h-80 space-y-1 overflow-y-auto pr-1 text-sm">
                  {p.items.map((i, k) => (
                    <li key={k} className={`flex items-center gap-2 ${i.past ? "text-white/30 line-through" : "text-white/80"}`}>
                      <span className="w-24 shrink-0 text-xs tabular-nums text-white/50">{day(i.date)}</span>
                      <span className="min-w-0 flex-1 truncate">{i.title}</span>
                      {i.movedFrom && !i.past && (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-amber-100/80" title={`Moved from ${day(i.movedFrom)}`}>
                          <ArrowRightLeft size={12} aria-hidden /> from {day(i.movedFrom, { weekday: "short" })}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </details>
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm text-white/75">
            <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} className="h-5 w-5 accent-emerald-400" />
            Also approve and send the next two weeks to their watches
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await applyTemplate(planId, picked, dates, { sendFirstWeeks: send });
                setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
                if (r.ok) {
                  setPreviews(null);
                  setPicked([]);
                  router.refresh();
                }
              })
            }
            className="flex min-h-12 items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-300/20 px-5 text-sm font-medium text-emerald-50 hover:bg-emerald-300/30 disabled:opacity-50"
          >
            <Send size={15} aria-hidden /> {pending ? "Creating…" : send ? "Create and send the next two weeks" : "Create as drafts"}
          </button>
        </div>
      )}
      {msg && (
        <p className={`mt-4 rounded-2xl border p-3 text-sm ${msg.ok ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100" : "border-red-300/20 bg-red-300/[0.06] text-red-200"}`} aria-live="polite">
          {msg.text}
        </p>
      )}
    </section>
  );
}

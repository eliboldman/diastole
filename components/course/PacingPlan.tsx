"use client";

import { Printer, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { savePacing } from "@/lib/course/actions";
import type { Leg, PaceRow } from "@/lib/course/course";

import { distNum, paceNum, parsePace, type U } from "./units";

const field = "rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1.5 text-[16px] text-white tabular-nums focus:border-emerald-300/40 focus:outline-none";

/** Race-day pacing, segment by segment: a target and a cue each, editable by the athlete or coach. */
export default function PacingPlan({ raceId, leg, rows: initial, edited, units }: { raceId: string; leg: Leg; rows: PaceRow[]; edited: boolean; units: U }) {
  const router = useRouter();
  const show = (r: PaceRow) => (leg === "run" ? paceNum(r.target, units) : String(r.target));
  const [rows, setRows] = useState(initial);
  const [texts, setTexts] = useState(initial.map(show));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial) || texts.some((t, i) => t !== show(initial[i]));

  const save = () => {
    const out: PaceRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const v = leg === "run" ? parsePace(texts[i], units) : Math.round(Number(texts[i]));
      if (!v || !Number.isFinite(v)) return setMsg(`Segment ${i + 1}: ${leg === "run" ? "pace like 7:30" : "watts like 210"}.`);
      out.push({ ...rows[i], target: v });
    }
    start(async () => {
      const r = await savePacing(raceId, out);
      setMsg(r.ok ? (r.message ?? "Saved.") : r.error);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div>
      <ol className="grid gap-2">
        {rows.map((r, i) => (
          <li key={`${r.start_m}-${i}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="min-w-0 flex-1 basis-32 text-sm">
                <span className="font-medium tabular-nums">
                  {distNum(r.start_m, units)}–{distNum(r.end_m, units)} {units}
                </span>
                <span className={`ml-2 text-xs tabular-nums ${r.grade >= 2.5 ? "text-amber-200/90" : r.grade <= -2.5 ? "text-sky-200/80" : "text-white/45"}`}>
                  {r.grade > 0 ? "+" : ""}
                  {r.grade}%
                </span>
              </span>
              <label className="flex items-center gap-1.5 text-xs text-white/55">
                <input
                  value={texts[i]}
                  inputMode={leg === "run" ? "text" : "numeric"}
                  onChange={(e) => setTexts(texts.map((t, j) => (j === i ? e.target.value.slice(0, 6) : t)))}
                  className={`${field} w-20`}
                  aria-label={`Segment ${i + 1} target ${leg === "run" ? `pace per ${units}` : "watts"}`}
                />
                {leg === "run" ? `/${units}` : "W"}
              </label>
            </div>
            <textarea
              value={r.note}
              rows={2}
              maxLength={120}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
              className={`${field} mt-2 w-full resize-none text-sm sm:h-10`}
              aria-label={`Segment ${i + 1} note`}
            />
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" disabled={!dirty || pending} onClick={save} className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-medium text-black disabled:opacity-40">
          {pending ? "Saving…" : "Save plan"}
        </button>
        {edited && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await savePacing(raceId, null);
                setMsg(r.ok ? (r.message ?? "Reset.") : r.error);
                if (r.ok) router.refresh();
              })
            }
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-white/60 hover:text-white"
          >
            <RotateCcw size={14} aria-hidden /> Use suggested
          </button>
        )}
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-white/60 hover:text-white">
          <Printer size={14} aria-hidden /> Print
        </button>
        {msg && <span className="text-xs text-white/60">{msg}</span>}
      </div>
    </div>
  );
}

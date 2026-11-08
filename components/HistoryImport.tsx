"use client";

import { Check, ExternalLink, FileArchive, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { kindOf, parseExportFile } from "@/lib/garmin/export-parse";
import { finishImport, importBatch, startImport } from "@/lib/garmin/history-actions";
import { scanZip } from "@/lib/garmin/export-scan";
import { BATCH_ACTIVITIES, BATCH_DAYS, cutoffDate, type HistoryActivity, type HistoryDay, type ImportRange } from "@/lib/garmin/history-types";

type Phase =
  | { kind: "idle" }
  | { kind: "reading"; pct: number; files: number }
  | { kind: "saving"; pct: number }
  | { kind: "done"; counts: Record<string, number> }
  | { kind: "error"; message: string };

const EXPORT_URL = "https://www.garmin.com/en-US/account/datamanagement/exportdata/";

function summary(c: Record<string, number>) {
  const parts = [
    c.wellness_days ? `${c.wellness_days.toLocaleString()} days of wellness` : null,
    c.sleep_nights ? `${c.sleep_nights.toLocaleString()} nights of sleep` : null,
    c.hrv_days ? `${c.hrv_days.toLocaleString()} days of HRV` : null,
    c.activities ? `${c.activities.toLocaleString()} activities` : null,
  ].filter(Boolean);
  return parts.length ? `Imported ${parts.join(", ")}.` : "Nothing new to import: Diastole already had all of it.";
}

export default function HistoryImport({ athleteId, forName }: { athleteId: string; forName?: string }) {
  const [range, setRange] = useState<ImportRange>("12m");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  async function run(file: File) {
    if (!/\.zip$/i.test(file.name)) return setPhase({ kind: "error", message: "That isn't a .zip file. Pick the ZIP Garmin emailed you." });
    abort.current = new AbortController();
    setPhase({ kind: "reading", pct: 0, files: 0 });

    // 1. Read only the files we need, entirely on this device.
    const days = new Map<string, HistoryDay>();
    const acts = new Map<string, HistoryActivity>();
    const cutoff = cutoffDate(range);
    try {
      await scanZip(
        file,
        (path) => kindOf(path) !== null,
        (path, text) => {
          const kind = kindOf(path);
          if (!kind) return;
          const p = parseExportFile(kind, text);
          for (const d of p.days) {
            if (cutoff && d.date < cutoff) continue;
            const prev = days.get(d.date) ?? { date: d.date };
            for (const [k, v] of Object.entries(d)) if (v !== null && v !== undefined) (prev as Record<string, unknown>)[k] = v;
            days.set(d.date, prev);
          }
          for (const a of p.activities) if (!cutoff || a.start_time.slice(0, 10) >= cutoff) acts.set(a.id, a);
        },
        (p) => setPhase({ kind: "reading", pct: Math.min(99, Math.round((p.bytesRead / p.totalBytes) * 100)), files: p.filesMatched }),
        abort.current.signal,
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") return setPhase({ kind: "idle" });
      return setPhase({ kind: "error", message: "Couldn't read that ZIP. Make sure it's the full export from Garmin, not a single activity file." });
    }
    if (!days.size && !acts.size) {
      return setPhase({ kind: "error", message: "No Garmin Connect health or activity data found in that ZIP. Is it the account export from Garmin?" });
    }

    // 2. Send compact rows in batches; the server skips anything the live sync already has.
    const start = await startImport(athleteId, range);
    if (!start.ok) return setPhase({ kind: "error", message: start.error });
    const dayList = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    const actList = [...acts.values()].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const batches = Math.max(1, Math.ceil(dayList.length / BATCH_DAYS), Math.ceil(actList.length / BATCH_ACTIVITIES));
    let counts: Record<string, number> = {};
    for (let i = 0; i < batches; i++) {
      if (abort.current.signal.aborted) {
        await finishImport(start.id, athleteId, "Cancelled");
        return setPhase({ kind: "idle" });
      }
      setPhase({ kind: "saving", pct: Math.round((i / (batches + 1)) * 100) });
      const r = await importBatch(start.id, athleteId, {
        days: dayList.slice(i * BATCH_DAYS, (i + 1) * BATCH_DAYS),
        activities: actList.slice(i * BATCH_ACTIVITIES, (i + 1) * BATCH_ACTIVITIES),
      });
      if (!r.ok) {
        await finishImport(start.id, athleteId, r.error);
        return setPhase({ kind: "error", message: r.error });
      }
      counts = r.counts ?? counts;
    }

    // 3. Recompute baselines so readiness uses the history right away.
    setPhase({ kind: "saving", pct: 96 });
    const done = await finishImport(start.id, athleteId);
    if (!done.ok) return setPhase({ kind: "error", message: done.error });
    navigator.vibrate?.([12, 40, 12]);
    setPhase({ kind: "done", counts: done.counts ?? counts });
  }

  const pct = phase.kind === "reading" ? phase.pct * 0.6 : phase.kind === "saving" ? 60 + phase.pct * 0.4 : phase.kind === "done" ? 100 : 0;

  return (
    <div className="grid gap-5">
      {phase.kind === "idle" || phase.kind === "error" ? (
        <>
          <ol className="stagger grid gap-3 text-sm text-white/75">
            <li className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
              <span className="font-medium text-white">1. Request it from Garmin.</span>{" "}
              {forName ? `${forName} signs in` : "Sign in"} at{" "}
              <a href={EXPORT_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-200 underline-offset-4 hover:underline">
                garmin.com → Export your data <ExternalLink size={13} />
              </a>{" "}
              and taps <span className="text-white">“Request data export”</span>.
            </li>
            <li className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
              <span className="font-medium text-white">2. Wait for Garmin&apos;s email.</span> It can take a day or more. Download the ZIP from the link.
            </li>
            <li className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
              <span className="font-medium text-white">3. Upload it here.</span> Your browser opens the ZIP and sends Diastole only sleep, HRV,
              heart rate, stress, Body Battery, VO₂ max, training readiness and activity summaries. Profile, contacts, orders,
              locations and everything else stay on this device.
            </li>
          </ol>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-4">
            <p className="text-sm text-white/60">How far back?</p>
            <div role="radiogroup" className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  ["12m", "Last 12 months", "Recommended"],
                  ["all", "All history", "Everything in the export"],
                ] as const
              ).map(([v, label, sub]) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={range === v}
                  onClick={() => setRange(v)}
                  className={`min-h-14 rounded-2xl border px-4 text-left text-sm ${
                    range === v ? "border-emerald-300/40 bg-emerald-300/15 text-white" : "border-white/10 text-white/60"
                  }`}
                >
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-white/50">{sub}</span>
                </button>
              ))}
            </div>
          </div>

          {phase.kind === "error" && (
            <p className="rounded-2xl border border-red-300/20 bg-red-300/[0.06] p-3 text-sm text-red-200">{phase.message}</p>
          )}

          <input
            ref={input}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void run(f);
            }}
          />
          <button
            onClick={() => input.current?.click()}
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-300/15 px-6 font-medium text-emerald-50 hover:bg-emerald-300/25"
          >
            <Upload size={18} /> Choose the Garmin ZIP
          </button>
        </>
      ) : (
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6">
          <div className="flex items-center gap-3">
            {phase.kind === "done" ? (
              <span className="success-pop flex h-10 w-10 items-center justify-center rounded-full bg-emerald-300/90 text-emerald-950">
                <Check size={20} strokeWidth={3} />
              </span>
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <FileArchive size={18} className="animate-pulse" />
              </span>
            )}
            <div>
              <p className="font-medium">
                {phase.kind === "reading"
                  ? "Reading the export on this device…"
                  : phase.kind === "saving"
                    ? pct > 95
                      ? "Rebuilding baselines…"
                      : "Saving to Diastole…"
                    : "History imported"}
              </p>
              <p className="text-sm text-white/55">
                {phase.kind === "reading" && `${phase.files} matching files so far`}
                {phase.kind === "saving" && "Skipping anything the live sync already has"}
                {phase.kind === "done" && summary(phase.counts)}
              </p>
            </div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-300/70 to-emerald-200 transition-[width] duration-500"
              style={{ width: `${Math.max(3, pct)}%` }}
            />
          </div>
          {phase.kind === "done" ? (
            <p className="mt-4 text-sm text-white/60">
              Readiness now compares against this history, so flags and coaching suggestions use it from today.
              {phase.counts.days_skipped_live ? ` ${phase.counts.days_skipped_live} days were already covered by the live sync and left as they were.` : ""}
            </p>
          ) : (
            <button onClick={() => abort.current?.abort()} className="mt-4 min-h-11 text-sm text-white/55 hover:text-white">
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { Activity, Check, Upload } from "lucide-react";
import { useRef, useState } from "react";

type Counts = { saved: number; noMatch: number; unreadable: number; failed: number };
type Phase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "reading"; checked: number; total: number; wanted: number }
  | { kind: "sending"; done: number; total: number }
  | { kind: "done"; counts: Counts; nothingToDo?: boolean }
  | { kind: "error"; message: string };

const MATCH_MS = 5_000;
const PARALLEL = 3;

/** Second step of the history import: charts, laps and routes for activities already in Diastole. */
export default function WorkoutFilesImport({ athleteId }: { athleteId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  async function run(file: File) {
    if (!/\.zip$/i.test(file.name)) return setPhase({ kind: "error", message: "That isn't a .zip file. Pick the ZIP Garmin emailed you." });
    const signal = (abort.current = new AbortController()).signal;
    const endpoint = `/api/import/fit/${athleteId}`;
    try {
      // 1. Which activities still need details?
      setPhase({ kind: "checking" });
      const res = await fetch(endpoint, { signal });
      if (!res.ok) throw new Error(res.status === 403 ? "You can only add workouts for yourself or your own athletes." : "Couldn't reach Diastole.");
      const starts = ((await res.json()).starts as string[]).map((s) => new Date(s).getTime()).sort((a, b) => a - b);
      if (!starts.length) return setPhase({ kind: "done", counts: { saved: 0, noMatch: 0, unreadable: 0, failed: 0 }, nothingToDo: true });

      const wanted = (iso: string) => {
        const t = new Date(iso).getTime();
        let lo = 0;
        let hi = starts.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (Math.abs(starts[mid] - t) <= MATCH_MS) return true;
          if (starts[mid] < t) lo = mid + 1;
          else hi = mid - 1;
        }
        return false;
      };

      // 2. Find those workouts in the export, on this device.
      setPhase({ kind: "reading", checked: 0, total: 0, wanted: 0 });
      const { scanWorkoutFiles } = await import("@/lib/garmin/export-fit-scan");
      const found = await scanWorkoutFiles(file, wanted, (p) => setPhase({ kind: "reading", checked: p.checked, total: p.total, wanted: p.wanted }), signal);
      if (!found.length)
        throw new Error(
          "None of the activities still missing details were found in this ZIP. Make sure it's the full Garmin account export (it includes the uploaded files).",
        );

      // 3. Send them, a few at a time.
      const counts: Counts = { saved: 0, noMatch: 0, unreadable: 0, failed: 0 };
      let next = 0;
      let done = 0;
      setPhase({ kind: "sending", done, total: found.length });
      const worker = async () => {
        while (next < found.length) {
          if (signal.aborted) return;
          const w = found[next++];
          try {
            const r = await fetch(endpoint, { method: "POST", body: w.bytes as BodyInit, headers: { "Content-Type": "application/octet-stream" }, signal });
            const body = r.ok ? await r.json() : null;
            if (body?.status === "saved") counts.saved++;
            else if (body?.status === "no_match") counts.noMatch++;
            else if (body?.status === "unreadable") counts.unreadable++;
            else counts.failed++;
          } catch {
            if (signal.aborted) return;
            counts.failed++;
          }
          done++;
          setPhase({ kind: "sending", done, total: found.length });
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
      if (signal.aborted) throw new DOMException("Import cancelled", "AbortError");
      navigator.vibrate?.([12, 40, 12]);
      setPhase({ kind: "done", counts });
    } catch (e) {
      const cancelled = e instanceof DOMException && e.name === "AbortError";
      setPhase({ kind: "error", message: cancelled ? "Cancelled. Anything already sent was kept." : (e as Error).message || "Something went wrong reading the ZIP." });
    }
  }

  const pct =
    phase.kind === "reading"
      ? (phase.total ? (phase.checked / phase.total) * 60 : 2)
      : phase.kind === "sending"
        ? 60 + (phase.total ? (phase.done / phase.total) * 40 : 40)
        : phase.kind === "done"
          ? 100
          : 2;

  if (phase.kind === "idle" || phase.kind === "error") {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-white/60">
          Adds heart rate, pace, power and cadence charts, laps and routes to workouts already imported. Your browser finds the workout files in the
          export and sends only those. Diastole reads each one, keeps the charts, laps and the route with the first and last 200 m removed, and
          discards the file. All-day monitoring files and everything else stay on this device.
        </p>
        {phase.kind === "error" && <p className="rounded-2xl border border-red-300/20 bg-red-300/[0.06] p-3 text-sm text-red-200">{phase.message}</p>}
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
      </div>
    );
  }

  const title =
    phase.kind === "checking"
      ? "Checking which workouts need details…"
      : phase.kind === "reading"
        ? "Finding workout files on this device…"
        : phase.kind === "sending"
          ? "Adding workout details…"
          : "Workout details added";
  const line =
    phase.kind === "reading"
      ? phase.total
        ? `${phase.checked.toLocaleString()} of ${phase.total.toLocaleString()} files checked · ${phase.wanted} workouts to add`
        : "Opening the export…"
      : phase.kind === "sending"
        ? `${phase.done} of ${phase.total} sent`
        : phase.kind === "done"
          ? phase.nothingToDo
            ? "Every activity already has its details."
            : [
                `${phase.counts.saved} ${phase.counts.saved === 1 ? "workout" : "workouts"} now have charts and laps`,
                phase.counts.noMatch ? `${phase.counts.noMatch} had no matching activity` : null,
                phase.counts.unreadable ? `${phase.counts.unreadable} couldn't be read` : null,
                phase.counts.failed ? `${phase.counts.failed} failed to send (try again later)` : null,
              ]
                .filter(Boolean)
                .join(" · ")
          : "";

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6">
      <div className="flex items-center gap-3">
        {phase.kind === "done" ? (
          <span className="success-pop flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-300/90 text-emerald-950">
            <Check size={20} strokeWidth={3} />
          </span>
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
            <Activity size={18} className="animate-pulse" />
          </span>
        )}
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-white/55">{line}</p>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-300/70 to-emerald-200 transition-[width] duration-500" style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
      {phase.kind !== "done" && (
        <button onClick={() => abort.current?.abort()} className="mt-4 min-h-11 text-sm text-white/55 hover:text-white">
          Cancel
        </button>
      )}
    </div>
  );
}

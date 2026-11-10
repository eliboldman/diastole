"use client";

import { CalendarPlus, Check, FileJson, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { importConnectWorkouts, scheduleImportedWorkouts, type ImportedItem } from "@/lib/workouts/actions";
import { parseScheduleCsv, type ScheduleRow, type ScheduleSkip } from "@/lib/workouts/schedule-import";

type Athlete = { id: string; name: string };
type FilePayload = { name: string; text: string };
type Pending = { rows: ScheduleRow[]; imported: { libraryId: string; title: string; garminId: string | null }[] };

const MAX_ZIP = 10_000_000;
const MAX_FILES = 100;

/** Pulls workout .json files and an optional schedule.csv out of a zip, in the browser. */
async function readZip(file: File): Promise<{ files: FilePayload[]; schedule: string | null; error?: string }> {
  if (file.size > MAX_ZIP) return { files: [], schedule: null, error: "Zip is over 10 MB." };
  const { unzipSync, strFromU8 } = await import("fflate");
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => {
        const base = f.name.split("/").pop() ?? "";
        if (f.name.startsWith("__MACOSX/") || base.startsWith(".")) return false;
        return /\.json$/i.test(base) || /^schedule\.csv$/i.test(base);
      },
    });
  } catch {
    return { files: [], schedule: null, error: "Couldn't open that zip." };
  }
  const files: FilePayload[] = [];
  let schedule: string | null = null;
  for (const [path, bytes] of Object.entries(entries)) {
    const base = path.split("/").pop() ?? path;
    if (/^schedule\.csv$/i.test(base)) schedule = strFromU8(bytes);
    else if (files.length < MAX_FILES) files.push({ name: base, text: bytes.length > 300_000 ? "" : strFromU8(bytes) });
  }
  return { files, schedule };
}

const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Library: add workouts exported from Garmin Connect (.json or a .zip of them), including swims. */
export default function ConnectImport({ athletes = [] }: { athletes?: Athlete[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<ImportedItem[] | null>(null);
  const [plan, setPlan] = useState<Pending | null>(null);
  const [who, setWho] = useState(athletes.length === 1 ? athletes[0].id : "");
  const [done, setDone] = useState<{ message: string; skipped: ScheduleSkip[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = (list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (!picked.length) return;
    setError(null);
    setDone(null);
    setPlan(null);
    start(async () => {
      const files: FilePayload[] = [];
      let schedule: string | null = null;
      for (const f of picked) {
        if (/\.zip$/i.test(f.name) || f.type.includes("zip")) {
          const z = await readZip(f);
          if (z.error) setError(`${f.name}: ${z.error}`);
          files.push(...z.files);
          schedule = z.schedule ?? schedule;
        } else if (/^schedule\.csv$/i.test(f.name)) {
          schedule = await f.text();
        } else if (files.length < MAX_FILES) {
          files.push({ name: f.name, text: f.size > 300_000 ? "" : await f.text() });
        }
      }
      if (!files.length) {
        setError((e) => e ?? "No workout .json files found.");
        setResults(null);
        return;
      }
      const all: ImportedItem[] = [];
      for (let i = 0; i < files.length; i += 20) {
        const { results } = await importConnectWorkouts(files.slice(i, i + 20));
        all.push(...results);
      }
      setResults(all);
      const rows = schedule ? parseScheduleCsv(schedule) : [];
      const imported = all.filter((r) => r.ok && r.id).map((r) => ({ libraryId: r.id!, title: r.title ?? "", garminId: r.garminId ?? null }));
      if (rows.length && imported.length) setPlan({ rows, imported });
      router.refresh();
    });
  };

  const schedule = () => {
    if (!plan || !who) return;
    start(async () => {
      const r = await scheduleImportedWorkouts(who, plan.rows, plan.imported);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // One time only: the offer goes away once it has run.
      setPlan(null);
      setDone({ message: r.message ?? "Done.", skipped: r.skipped ?? [] });
      router.refresh();
    });
  };

  const dates = plan?.rows.map((r) => r.date).sort();
  const added = results?.filter((r) => r.ok && !r.reused).length ?? 0;
  const reused = results?.filter((r) => r.reused).length ?? 0;
  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <div className="mt-4">
      <input
        ref={input}
        type="file"
        accept=".json,application/json,.zip,application/zip,.csv,text/csv"
        multiple
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-4 text-sm text-white/80 transition active:scale-95 hover:bg-white/[0.1] disabled:opacity-50"
      >
        <FileJson size={16} aria-hidden /> {pending ? "Working…" : "Import from Garmin Connect (.json or .zip)"}
      </button>

      {error && (
        <p className="mt-3 flex items-start gap-2 text-sm text-red-200" role="alert">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> <span className="min-w-0 break-words">{error}</span>
        </p>
      )}

      {plan && dates && (
        <div className="mt-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.06] p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="flex min-w-0 items-start gap-2">
              <CalendarPlus size={16} className="mt-0.5 shrink-0 text-emerald-200" aria-hidden />
              <span>
                This zip includes a schedule: {plan.rows.length} workout{plan.rows.length === 1 ? "" : "s"}, {shortDate(dates[0])}
                {dates.length > 1 && dates[0] !== dates[dates.length - 1] ? ` – ${shortDate(dates[dates.length - 1])}` : ""}. Add them to a calendar once, as drafts?
              </span>
            </p>
            <button type="button" onClick={() => setPlan(null)} aria-label="Skip the schedule" className="-m-2 p-2 text-white/50 hover:text-white/80">
              <X size={16} aria-hidden />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={who}
              onChange={(e) => setWho(e.target.value)}
              aria-label="Athlete"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 text-sm sm:flex-none"
            >
              <option value="">Pick an athlete…</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!who || pending}
              onClick={schedule}
              className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-medium text-black transition active:scale-95 disabled:opacity-50"
            >
              Add to calendar
            </button>
          </div>
          <p className="mt-2 text-xs text-white/55">Nothing is sent to a watch and nothing repeats. Past dates and workouts already on those days are skipped.</p>
        </div>
      )}

      {done && (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm" aria-live="polite">
          <p className="flex items-start gap-2">
            <Check size={16} className="mt-0.5 shrink-0 text-emerald-200" aria-hidden /> {done.message}
          </p>
          {done.skipped.length > 0 && (
            <ul className="ml-6 mt-1 grid gap-0.5 text-xs text-white/55">
              {done.skipped.map((s, i) => (
                <li key={i}>
                  Skipped {shortDate(s.date)} {s.title}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {results && (
        <div className="mt-3" aria-live="polite">
          {results.length > 3 && (
            <p className="mb-2 text-sm text-white/70">
              Added {added} workout{added === 1 ? "" : "s"}
              {reused ? `, ${reused} already in the library` : ""}
              {failed.length ? `, ${failed.length} couldn't be read` : ""}.
            </p>
          )}
          <ul className="grid gap-2">
            {(results.length > 3 ? results.filter((r) => !r.ok || r.notes?.length) : results).map((r, i) => (
              <li key={i} className={`rounded-2xl border p-3 text-sm ${r.ok ? "border-emerald-300/20 bg-emerald-300/[0.05]" : "border-red-300/20 bg-red-300/[0.05]"}`}>
                <p className="flex items-start gap-2">
                  {r.ok ? <Check size={16} className="mt-0.5 shrink-0 text-emerald-200" aria-hidden /> : <TriangleAlert size={16} className="mt-0.5 shrink-0 text-red-200" aria-hidden />}
                  <span className="min-w-0 break-words">
                    {r.ok ? (
                      <>
                        {r.reused ? "Already had " : "Added "}
                        <strong className="font-medium">{r.title}</strong>
                      </>
                    ) : (
                      <>
                        <span className="text-white/60">{r.file}:</span> {r.error}
                      </>
                    )}
                  </span>
                </p>
                {r.notes?.map((n) => (
                  <p key={n} className="ml-6 mt-1 text-xs text-white/55">
                    {n}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

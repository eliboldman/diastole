"use client";

import { Check, ChevronRight, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

type Result = { file: string; status: "created" | "details_added" | "already_there" | "unreadable" | "failed"; id?: string };

const MAX_BYTES = 4 * 1024 * 1024;

const LABEL: Record<Result["status"], string> = {
  created: "Added",
  details_added: "Charts and laps added to the existing workout",
  already_there: "Already in Diastole",
  unreadable: "Not a workout file Diastole can read",
  failed: "Couldn't save, try again",
};

/** FIT files from a picked .fit or .zip (Garmin's "Export Original" wraps the FIT in a ZIP). */
async function fitFiles(file: File): Promise<{ name: string; bytes: Uint8Array }[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!/\.zip$/i.test(file.name)) return [{ name: file.name, bytes }];
  const { unzipSync } = await import("fflate");
  const entries = unzipSync(bytes, { filter: (f) => /\.fit$/i.test(f.name) && f.originalSize <= MAX_BYTES });
  return Object.entries(entries).map(([name, b]) => ({ name: name.split("/").pop() ?? name, bytes: b }));
}

/** Upload one or more workout files (FIT or ZIP) for an athlete. */
export default function ActivityUpload({ athleteId }: { athleteId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run(picked: File[]) {
    setBusy(true);
    setError(null);
    setResults([]);
    const out: Result[] = [];
    try {
      for (const f of picked) {
        if (!/\.(fit|zip)$/i.test(f.name)) {
          out.push({ file: f.name, status: "unreadable" });
          continue;
        }
        let files;
        try {
          files = await fitFiles(f);
        } catch {
          out.push({ file: f.name, status: "unreadable" });
          continue;
        }
        if (!files.length) out.push({ file: f.name, status: "unreadable" });
        for (const w of files) {
          if (w.bytes.length > MAX_BYTES) {
            out.push({ file: w.name, status: "failed" });
            continue;
          }
          try {
            const r = await fetch(`/api/activity/upload/${athleteId}`, {
              method: "POST",
              body: w.bytes as BodyInit,
              headers: { "Content-Type": "application/octet-stream" },
            });
            if (r.status === 403) throw new Error("You can only upload workouts for yourself or your own athletes.");
            const body = r.ok ? await r.json() : null;
            out.push({ file: w.name, status: body?.status ?? "failed", id: body?.id });
          } catch (e) {
            if (e instanceof Error && e.message.startsWith("You can only")) throw e;
            out.push({ file: w.name, status: "failed" });
          }
          setResults([...out]);
        }
      }
      setResults(out);
      if (out.some((r) => r.status === "created" || r.status === "details_added")) navigator.vibrate?.([12, 40, 12]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <input
        ref={input}
        type="file"
        multiple
        accept=".fit,.zip,application/zip,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (picked.length) void run(picked);
        }}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-300/15 px-6 font-medium text-emerald-50 hover:bg-emerald-300/25 disabled:opacity-60"
      >
        <Upload size={18} aria-hidden /> {busy ? "Uploading…" : "Choose workout files"}
      </button>
      {error && <p className="rounded-2xl border border-red-300/20 bg-red-300/[0.06] p-3 text-sm text-red-200">{error}</p>}
      {results.length > 0 && (
        <ul className="grid gap-2" aria-live="polite">
          {results.map((r, i) => {
            const ok = r.status === "created" || r.status === "details_added" || r.status === "already_there";
            const inner = (
              <>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{r.file}</span>
                  <span className={`block text-xs ${ok ? "text-emerald-200/80" : "text-red-200/80"}`}>{LABEL[r.status]}</span>
                </span>
                {r.id ? <ChevronRight size={16} className="shrink-0 text-white/40" aria-hidden /> : ok ? <Check size={16} aria-hidden /> : null}
              </>
            );
            const cls = "flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2";
            return (
              <li key={`${r.file}-${i}`}>
                {r.id ? (
                  <Link href={`/activity/${r.id}`} className={`lift ${cls} hover:bg-white/[0.08]`}>
                    {inner}
                  </Link>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

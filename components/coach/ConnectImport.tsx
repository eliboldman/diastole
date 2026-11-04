"use client";

import { Check, FileJson, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { importConnectWorkouts, type ImportedItem } from "@/lib/workouts/actions";

/** Library: add workouts exported from Garmin Connect (.json), including swims. */
export default function ConnectImport() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<ImportedItem[] | null>(null);
  const [pending, start] = useTransition();

  const pick = (list: FileList | null) => {
    const files = [...(list ?? [])].slice(0, 20);
    if (!files.length) return;
    start(async () => {
      const payload = await Promise.all(files.map(async (f) => ({ name: f.name, text: f.size > 300_000 ? "" : await f.text() })));
      const { results } = await importConnectWorkouts(payload);
      setResults(results);
      router.refresh();
    });
  };

  return (
    <div className="mt-4">
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
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
        <FileJson size={16} aria-hidden /> {pending ? "Importing…" : "Import from Garmin Connect (.json)"}
      </button>

      {results && (
        <ul className="mt-3 grid gap-2" aria-live="polite">
          {results.map((r, i) => (
            <li key={i} className={`rounded-2xl border p-3 text-sm ${r.ok ? "border-emerald-300/20 bg-emerald-300/[0.05]" : "border-red-300/20 bg-red-300/[0.05]"}`}>
              <p className="flex items-start gap-2">
                {r.ok ? <Check size={16} className="mt-0.5 shrink-0 text-emerald-200" aria-hidden /> : <TriangleAlert size={16} className="mt-0.5 shrink-0 text-red-200" aria-hidden />}
                <span className="min-w-0 break-words">
                  {r.ok ? (
                    <>
                      Added <strong className="font-medium">{r.title}</strong>
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
      )}
    </div>
  );
}

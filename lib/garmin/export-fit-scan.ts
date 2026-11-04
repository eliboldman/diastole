// Browser-side: find workout (activity) FIT files inside a Garmin account export.
// Garmin keeps them in nested ZIPs under DI-Connect-Uploaded-Files, mixed with tens of thousands of
// all-day monitoring files. Each file is checked quickly and dropped unless it's a workout we want;
// nothing leaves the device here.
//
// The nested ZIPs are read through their central directory (streaming them overflows the stack
// with ~12,000 entries each), decompressing FIT files in batches so memory stays bounded.
import { unzipSync } from "fflate";

import { fitFileInfo } from "../activity/fit.ts";

const NESTED = /DI-Connect-Uploaded-Files\/[^/]*\.zip$/i;
const FIT = /\.fit$/i;
const BATCH = 1500;

export type FitScanProgress = { checked: number; total: number; workouts: number; wanted: number };
export type Workout = { start: string; bytes: Uint8Array };

const breathe = () => new Promise((r) => setTimeout(r, 0));

export async function scanWorkoutFiles(
  file: File,
  want: (startIso: string) => boolean,
  onProgress: (p: FitScanProgress) => void,
  signal?: AbortSignal,
): Promise<Workout[]> {
  const stop = () => {
    if (signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
  };
  const outer = new Uint8Array(await file.arrayBuffer());
  stop();
  const nested = unzipSync(outer, { filter: (f) => NESTED.test(f.name) });

  // List every FIT file first so progress has a total.
  const parts = Object.values(nested).map((bytes) => {
    const names: string[] = [];
    unzipSync(bytes, {
      filter: (f) => {
        if (FIT.test(f.name)) names.push(f.name);
        return false;
      },
    });
    return { bytes, names };
  });

  const progress: FitScanProgress = { checked: 0, total: parts.reduce((n, p) => n + p.names.length, 0), workouts: 0, wanted: 0 };
  onProgress({ ...progress });
  const found: Workout[] = [];

  for (const part of parts) {
    for (let i = 0; i < part.names.length; i += BATCH) {
      stop();
      const batch = new Set(part.names.slice(i, i + BATCH));
      const files = unzipSync(part.bytes, { filter: (f) => batch.has(f.name) });
      for (const bytes of Object.values(files)) {
        progress.checked++;
        const info = fitFileInfo(bytes);
        if (info.type !== "activity" || !info.start) continue;
        progress.workouts++;
        if (!want(info.start)) continue;
        progress.wanted++;
        found.push({ start: info.start, bytes });
      }
      onProgress({ ...progress });
      await breathe();
    }
  }
  return found;
}

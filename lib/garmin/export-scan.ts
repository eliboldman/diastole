// Browser-side: stream a Garmin account export ZIP and hand back only the files we want.
// Nothing else in the archive is decompressed or kept, and nothing leaves the device here.
import { Unzip, UnzipInflate } from "fflate";

export type ScanProgress = { bytesRead: number; totalBytes: number; filesMatched: number };

export async function scanZip(
  file: File,
  wanted: (path: string) => boolean,
  onFile: (path: string, text: string) => void,
  onProgress: (p: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const decoder = () => new TextDecoder("utf-8");
  let matched = 0;
  const pending: Promise<void>[] = [];

  const unzip = new Unzip((entry) => {
    if (!wanted(entry.name)) return; // never started -> skipped without decompressing
    matched++;
    const parts: Uint8Array[] = [];
    pending.push(
      new Promise<void>((resolve, reject) => {
        entry.ondata = (err, chunk, final) => {
          if (err) return reject(err);
          parts.push(chunk);
          if (final) {
            const td = decoder();
            const text = parts.map((p, i) => td.decode(p, { stream: i < parts.length - 1 })).join("");
            try {
              onFile(entry.name, text);
              resolve();
            } catch (e) {
              reject(e);
            }
          }
        };
        entry.start();
      }),
    );
  });
  unzip.register(UnzipInflate);

  const reader = file.stream().getReader();
  let read = 0;
  for (;;) {
    if (signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
    const { done, value } = await reader.read();
    if (done) {
      unzip.push(new Uint8Array(0), true);
      break;
    }
    read += value.byteLength;
    unzip.push(value);
    onProgress({ bytesRead: read, totalBytes: file.size, filesMatched: matched });
    // Let the page breathe between chunks so the progress bar animates.
    await new Promise((r) => setTimeout(r, 0));
  }
  await Promise.all(pending);
}

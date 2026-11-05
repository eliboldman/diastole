// Browser-side media for messages: shrink photos before upload, record voice notes.

export const PHOTO_MAX_PX = 1600;

/** A JPEG no larger than PHOTO_MAX_PX on its long side (EXIF orientation applied by the browser). */
export async function shrinkPhoto(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, PHOTO_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("Couldn't read that photo."))), "image/jpeg", 0.82));
  return { blob, w, h };
}

/**
 * The audio format to record. AAC in MP4 first: it plays everywhere (iPhone, Safari, Chrome, Firefox);
 * WebM/Opus only where AAC recording isn't available (Firefox), since older iPhones can't play it.
 */
export function recorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/aac", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export const extFor = (mime: string) => (mime.includes("mp4") || mime.includes("aac") ? "m4a" : mime.includes("ogg") ? "ogg" : mime.includes("webm") ? "webm" : "jpg");
/** Storage only accepts the base type ("audio/webm"), not codec parameters. */
export const baseMime = (mime: string) => mime.split(";")[0] || "audio/webm";

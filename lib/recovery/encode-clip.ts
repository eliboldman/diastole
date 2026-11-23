// Turns a phone video into a demo clip in the browser, matching scripts/recovery-videos.ts:
// 720 px tall, muted, at most 20 s, with the last half second crossfading into the first so the
// clip loops without a jump, plus a poster frame. Plays the video once in the background (about
// as long as the clip) through a canvas into MediaRecorder; no upload of the full original.

const LOOP = 20; // seconds
const FADE = 0.5;
const FPS = 30;

export type EncodedClip = { video: Blob; poster: Blob; seconds: number };

function mp4Type(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["video/mp4;codecs=avc1", "video/mp4"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
}

/** This browser can make the MP4 here (Safari / the iPhone app, recent Chrome). */
export function canEncodeClip(): boolean {
  return mp4Type() !== null && typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;
}

const once = (el: HTMLMediaElement, ev: string) =>
  new Promise<void>((ok, fail) => {
    const done = () => { el.removeEventListener(ev, done); el.removeEventListener("error", bad); ok(); };
    const bad = () => { el.removeEventListener(ev, done); el.removeEventListener("error", bad); fail(new Error("Couldn't read that video.")); };
    el.addEventListener(ev, done);
    el.addEventListener("error", bad);
  });

async function open(url: string) {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  await once(v, "loadeddata");
  return v;
}

async function seek(v: HTMLVideoElement, t: number) {
  if (Math.abs(v.currentTime - t) < 0.01) return;
  const p = once(v, "seeked");
  v.currentTime = t;
  await p;
}

const toBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("Couldn't make the poster."))), "image/jpeg", 0.8));

export async function encodeClip(file: File, onProgress: (fraction: number) => void = () => {}): Promise<EncodedClip> {
  const type = mp4Type();
  if (!type) throw new Error("This browser can't prepare video. Use the Diastole iPhone app or Safari.");
  const url = URL.createObjectURL(file);
  const main = await open(url);
  const head = await open(url);
  try {
    const dur = main.duration;
    if (!Number.isFinite(dur) || dur < 2.5) throw new Error("That clip is too short. Film 10–20 seconds.");
    const len = Math.min(LOOP, Math.max(2, dur - FADE));
    const h = 720;
    const w = Math.round((h * main.videoWidth) / Math.max(1, main.videoHeight) / 2) * 2;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't prepare video.");

    // Poster: a frame one second in.
    await seek(main, Math.min(1 + FADE, len));
    ctx.drawImage(main, 0, 0, w, h);
    const poster = await toBlob(canvas);

    // Output time t shows the source at t + FADE; its last FADE seconds blend into the source's
    // first FADE seconds (the `head` copy), which is where the loop picks up again.
    await seek(main, FADE);
    await seek(head, 0);
    ctx.drawImage(main, 0, 0, w, h);
    const rec = new MediaRecorder(canvas.captureStream(FPS), { mimeType: type, videoBitsPerSecond: 2_500_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((ok) => { rec.onstop = () => ok(); });
    rec.start(250);
    await main.play();

    await new Promise<void>((ok) => {
      let blending = false;
      const frame = () => {
        const t = main.currentTime - FADE;
        if (!blending && t >= len - FADE) {
          blending = true;
          void head.play();
        }
        ctx.globalAlpha = 1;
        ctx.drawImage(main, 0, 0, w, h);
        if (blending) {
          ctx.globalAlpha = Math.min(1, Math.max(0, (t - (len - FADE)) / FADE));
          ctx.drawImage(head, 0, 0, w, h);
          ctx.globalAlpha = 1;
        }
        onProgress(Math.min(1, Math.max(0, t / len)));
        if (t >= len || main.ended) ok();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    main.pause();
    head.pause();
    rec.stop();
    await stopped;
    const video = new Blob(chunks, { type: "video/mp4" });
    if (video.size < 10_000) throw new Error("The clip came out empty. Keep this screen open while it prepares.");
    return { video, poster, seconds: Math.round(len * 10) / 10 };
  } finally {
    main.removeAttribute("src");
    head.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}

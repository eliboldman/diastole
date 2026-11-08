// Turns a raw recording into the finished walkthrough: smooth zooms on each tap, H.264 MP4 under
// 90 seconds (intro and outro cards are already in the recording), plus a short clip (15 s max)
// per feature segment.
//
//   node walkthroughs/edit.ts athlete      (reads walkthroughs/out/athlete.webm + athlete.json)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const role = process.argv[2];
if (role !== "athlete" && role !== "coach") {
  console.error("Usage: node walkthroughs/edit.ts athlete|coach");
  process.exit(1);
}
const OUT = join("walkthroughs", "out");
const meta = JSON.parse(readFileSync(join(OUT, `${role}.json`), "utf8")) as {
  size: { width: number; height: number };
  introEnd: number;
  outroStart: number;
  end: number;
  taps: { t: number; x: number; y: number }[];
  segments: Record<string, [number, number]>;
};
const { width: W, height: H } = meta.size;
const FPS = 30;
const ZOOM = 0.3; // up to 1.3x
const MAX = 89;

// The zoom: a smooth rise and fall around each tap, centred on where the tap landed.
const T = `(in/${FPS})`;
const windows = meta.taps.filter((p) => p.t > meta.introEnd && p.t < meta.outroStart).map((p) => ({ a: Math.max(0, p.t - 0.35), b: p.t + 1.4, x: p.x, y: p.y }));
const bump = windows.map((w) => `between(${T},${w.a.toFixed(2)},${w.b.toFixed(2)})*${ZOOM}*sin(PI*(${T}-${w.a.toFixed(2)})/${(w.b - w.a).toFixed(2)})`).join("+") || "0";
const z = `min(1+${ZOOM},1+${bump})`;
const pick = (axis: "x" | "y") => windows.reduceRight((acc, w) => `if(between(${T},${w.a.toFixed(2)},${w.b.toFixed(2)}),${Math.round(w[axis])},${acc})`, axis === "x" ? "iw/2" : "ih/2");
const x = `max(0,min(iw-iw/zoom,${pick("x")}-iw/zoom/2))`;
const y = `max(0,min(ih-ih/zoom,${pick("y")}-ih/zoom/2))`;

// Over 89 s: speed the whole thing up just enough.
const speed = meta.end > MAX ? meta.end / MAX : 1;
const filters = [
  `fps=${FPS}`,
  `scale=${W}:${H}`,
  `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${W}x${H}:fps=${FPS}`,
  speed > 1 ? `setpts=PTS/${speed.toFixed(3)}` : null,
  "format=yuv420p",
].filter(Boolean).join(",");

const tour = join(OUT, `${role}-tour.mp4`);
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", join(OUT, `${role}.webm`), "-vf", filters, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-movflags", "+faststart", tour], { stdio: "inherit" });
console.log(`✓ ${tour}${speed > 1 ? ` (sped up ${speed.toFixed(2)}x to stay under 90 s)` : ""}`);

// One short clip per feature.
for (const [id, [a, b]] of Object.entries(meta.segments)) {
  const start = Math.max(0, a / speed - 0.3);
  const dur = Math.min(15, (b - a) / speed + 0.6);
  const file = join(OUT, `${id}.mp4`);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", start.toFixed(2), "-i", tour, "-t", dur.toFixed(2), "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-movflags", "+faststart", file], { stdio: "inherit" });
  console.log(`✓ ${file} (${dur.toFixed(1)} s)`);
}
console.log(`Next: node walkthroughs/upload.ts`);

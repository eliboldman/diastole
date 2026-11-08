// Recovery demo clips: compress the coach's videos and (with --upload) put them in Supabase Storage.
//
//   node scripts/recovery-videos.ts ~/Diastole/recovery-videos            # compress + check matches
//   node scripts/recovery-videos.ts ~/Diastole/recovery-videos --upload   # ...and upload
//
// Each clip becomes ~20 s of 720p H.264 MP4, muted, with a short crossfade from the end back into
// the start so it loops cleanly, plus a poster frame. Filenames are matched to the catalog in
// lib/recovery/catalog.ts ("foam-roll-hamstrings.mov"). Per-side moves are mirrored in the player,
// so record one side only. Output goes to a temp folder, never into the repo.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { matchSlug, moveBySlug } from "../lib/recovery/catalog.ts";

const LOOP = 20; // seconds
const FADE = 0.5;

const args = process.argv.slice(2);
const upload = args.includes("--upload");
const folderArg = args.find((a) => !a.startsWith("--"));
if (!folderArg) {
  console.error("Usage: node scripts/recovery-videos.ts <folder> [--upload]");
  process.exit(1);
}
const folder = resolve(folderArg.replace(/^~/, homedir()));
const out = join(tmpdir(), "diastole-recovery");
mkdirSync(out, { recursive: true });

const files = readdirSync(folder).filter((f) => /\.(mov|mp4|m4v)$/i.test(f));
if (!files.length) {
  console.error(`No .mov or .mp4 files in ${folder}`);
  process.exit(1);
}

const duration = (file: string) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim()) || 0;

type Done = { slug: string; video: string; poster: string; seconds: number };
const done: Done[] = [];
const unmatched: string[] = [];

for (const f of files) {
  const slug = matchSlug(f);
  if (!slug) {
    unmatched.push(f);
    continue;
  }
  const src = join(folder, f);
  const len = Math.min(LOOP, Math.max(2, duration(src) - FADE));
  const video = join(out, `${slug}.mp4`);
  const poster = join(out, `${slug}.jpg`);
  // [main] = FADE..len+FADE; [head] = 0..FADE; fading main's end into head makes the last frame
  // flow into the first one when the clip loops.
  const filter =
    `[0:v]scale=-2:720,fps=30,format=yuv420p,split[a][b];` +
    `[a]trim=${FADE}:${len + FADE},setpts=PTS-STARTPTS[main];` +
    `[b]trim=0:${FADE},setpts=PTS-STARTPTS[head];` +
    `[main][head]xfade=transition=fade:duration=${FADE}:offset=${len - FADE}[v]`;
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", src, "-filter_complex", filter, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-movflags", "+faststart", video]);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", "1", "-i", video, "-frames:v", "1", "-q:v", "4", poster]);
  done.push({ slug, video, poster, seconds: Math.round(len * 10) / 10 });
  console.log(`✓ ${f} → ${moveBySlug(slug)!.name} (${len.toFixed(1)} s)`);
}

if (unmatched.length) console.log(`\nNot matched (rename to a catalog id, e.g. foam-roll-calves.mov):\n  ${unmatched.join("\n  ")}`);
console.log(`\nCompressed ${done.length} clip(s) into ${out}`);

if (!upload) {
  console.log("Run again with --upload to put them in Supabase Storage.");
  process.exit(0);
}

// Upload with the service role (reads .env.local; nothing is printed).
const env = Object.fromEntries(
  (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "")
    .split("\n")
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(url, key, { auth: { persistSession: false } });
for (const d of done) {
  const v = await admin.storage.from("recovery").upload(`clips/${d.slug}.mp4`, readFileSync(d.video), { contentType: "video/mp4", upsert: true, cacheControl: "604800" });
  const p = await admin.storage.from("recovery").upload(`posters/${d.slug}.jpg`, readFileSync(d.poster), { contentType: "image/jpeg", upsert: true, cacheControl: "604800" });
  if (v.error || p.error) {
    console.error(`✗ ${d.slug}: ${(v.error ?? p.error)!.message}`);
    continue;
  }
  const { error } = await admin.from("recovery_videos").upsert({ slug: d.slug, path: `clips/${d.slug}.mp4`, poster: `posters/${d.slug}.jpg`, seconds: d.seconds, updated_at: new Date().toISOString() });
  console.log(error ? `✗ ${d.slug}: ${error.message}` : `↑ ${d.slug}`);
}

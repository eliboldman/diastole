// Uploads the finished walkthroughs to the public "media" bucket, where Help and onboarding find
// them. Uses the service key from .env.local (nothing is printed).   node walkthroughs/upload.ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { WALKTHROUGHS } from "../lib/walkthroughs.ts";

const env = Object.fromEntries(
  (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "")
    .split("\n")
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const OUT = join("walkthroughs", "out");
const ready = new Set(existsSync(OUT) ? readdirSync(OUT) : []);
for (const w of WALKTHROUGHS) {
  const name = w.file.split("/").pop()!;
  if (!ready.has(name)) continue;
  const { error } = await admin.storage.from("media").upload(w.file, readFileSync(join(OUT, name)), { contentType: "video/mp4", upsert: true, cacheControl: "86400" });
  console.log(error ? `✗ ${name}: ${error.message}` : `↑ ${w.title}`);
}

// Records a walkthrough at iPhone size with Playwright, signed in as a demo account.
//
//   DEMO_ATHLETE_EMAIL=… DEMO_ATHLETE_PASSWORD=… node walkthroughs/record.ts athlete
//   DEMO_COACH_EMAIL=…   DEMO_COACH_PASSWORD=…   node walkthroughs/record.ts coach
//   BASE_URL defaults to the live site (NEXT_PUBLIC_SITE_URL in .env.local).
//
// Captions, tap ripples and the intro/outro cards are drawn in the page itself, so the video needs
// no text rendering later. Writes walkthroughs/out/<role>.webm and <role>.json (tap times and
// positions for zooms, and where each feature segment starts and ends for the short clips).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, devices, type Locator, type Page } from "playwright";

import { TOURS } from "./tours.ts";

const role = process.argv[2] as "athlete" | "coach";
if (role !== "athlete" && role !== "coach") {
  console.error("Usage: node walkthroughs/record.ts athlete|coach");
  process.exit(1);
}
const env = (k: string) => process.env[k] ?? "";
const siteFromEnv = existsSync(".env.local") ? /^NEXT_PUBLIC_SITE_URL=(.*)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.replace(/^"|"$/g, "") : undefined;
const BASE = (env("BASE_URL") || siteFromEnv || "http://localhost:3000").replace(/\/$/, "");
// A session saved by walkthroughs/seed-demo.ts, or else an email and password to sign in with.
const savedState = join("walkthroughs", "out", `${role}.state.json`);
const email = env(role === "coach" ? "DEMO_COACH_EMAIL" : "DEMO_ATHLETE_EMAIL");
const password = env(role === "coach" ? "DEMO_COACH_PASSWORD" : "DEMO_ATHLETE_PASSWORD");
if (!existsSync(savedState) && (!email || !password)) {
  console.error("Run node walkthroughs/seed-demo.ts first (or set the DEMO_* email and password variables).");
  process.exit(1);
}

const OUT = join("walkthroughs", "out");
mkdirSync(OUT, { recursive: true });
const phone = devices["iPhone 15 Pro"];
// Frames are captured at the phone's pixel density (sharp), up to 1080 px wide.
const FRAMES = join(OUT, `${role}-frames`);

// Drawn in the page with inline styles (the app's own CSS never touches them): a caption bar and
// tap ripples, in the app's look.
const CAPTION_STYLE =
  "position:fixed;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom) + 150px);z-index:2147483647;padding:14px 16px;border-radius:18px;" +
  "background:rgba(6,10,9,.88);border:1px solid rgba(255,255,255,.16);color:#fff;font:600 17px/1.35 -apple-system,system-ui,sans-serif;text-align:center;" +
  "box-shadow:0 10px 40px rgba(0,0,0,.5);pointer-events:none;transition:opacity .25s,transform .25s;opacity:0;transform:translateY(8px)";
const TAP_STYLE = "position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid rgba(255,255,255,.92);z-index:2147483647;pointer-events:none";

export type Tour = {
  page: Page;
  go: (path: string) => Promise<void>;
  caption: (text: string, ms: number) => Promise<void>;
  tap: (target: Locator) => Promise<void>;
  type: (target: Locator, text: string) => Promise<void>;
  scroll: (dy: number) => Promise<void>;
  segment: (id: string, steps: () => Promise<void>) => Promise<void>;
};

const card = (title: string, sub: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#060a09;color:#fff;font-family:-apple-system,system-ui,sans-serif}
.c{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;animation:in .8s ease-out both}
img{width:120px;height:120px;border-radius:28px;box-shadow:0 0 60px rgba(110,231,183,.35)}h1{margin:0;font-size:30px;font-weight:700}p{margin:0;color:rgba(255,255,255,.6);font-size:17px}
@keyframes in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}</style></head>
<body><div class="c"><img src="${BASE}/logo.png" alt=""><h1>${title}</h1><p>${sub}</p></div></body></html>`;

// Full Chromium in its new headless mode: the screencast then comes at the phone's pixel density.
const browser = await chromium.launch({ channel: "chromium", args: ["--force-device-scale-factor=3"] });
// Sign in without recording (or reuse the saved session), then record with it.
let state: Awaited<ReturnType<Awaited<ReturnType<typeof browser.newContext>>["storageState"]>>;
if (existsSync(savedState)) {
  state = JSON.parse(readFileSync(savedState, "utf8"));
} else {
  const login = await browser.newContext({ ...phone });
  const lp = await login.newPage();
  await lp.goto(`${BASE}/login`);
  await lp.locator('input[name="email"]').fill(email);
  await lp.locator('input[name="password"]').fill(password);
  await lp.getByRole("button", { name: "Sign in", exact: true }).click();
  await lp.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  state = await login.storageState();
  await login.close();
}

const ctx = await browser.newContext({ ...phone, storageState: state });
const page = await ctx.newPage();

// Chrome's screencast: a JPEG each time the screen changes, with its timestamp.
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
const cdp = await ctx.newCDPSession(page);
const frames: { file: string; t: number }[] = [];
cdp.on("Page.screencastFrame", (f) => {
  const file = join(FRAMES, `f${String(frames.length).padStart(5, "0")}.jpg`);
  writeFileSync(file, Buffer.from(f.data, "base64"));
  frames.push({ file, t: f.metadata.timestamp ?? Date.now() / 1000 });
  void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1080, maxHeight: 2400, everyNthFrame: 1 });
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const taps: { t: number; x: number; y: number }[] = [];
const segments: Record<string, [number, number]> = {};
const scale = 1; // taps are stored in CSS pixels; edit.ts scales them to the video
const pause = (ms: number) => page.waitForTimeout(ms);

const tour: Tour = {
  page,
  go: async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => {});
    await pause(700);
  },
  caption: async (text, ms) => {
    await page.evaluate(
      ([txt, css]) => {
        document.getElementById("wt-cap")?.remove();
        const el = document.createElement("div");
        el.id = "wt-cap";
        el.style.cssText = css;
        el.textContent = txt;
        document.body.appendChild(el);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.style.opacity = "1";
          el.style.transform = "none";
        }));
      },
      [text, CAPTION_STYLE],
    );
    await pause(ms);
    await page.evaluate(() => {
      const el = document.getElementById("wt-cap");
      if (el) el.style.opacity = "0";
    });
    await pause(250);
  },
  tap: async (target) => {
    try {
      await target.waitFor({ state: "visible", timeout: 4000 });
      const box = await target.boundingBox();
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        taps.push({ t: now(), x: x * scale, y: y * scale });
        await page.evaluate(
          ([px, py, css]) => {
            const d = document.createElement("div");
            d.style.cssText = `${css};left:${px}px;top:${py}px`;
            document.body.appendChild(d);
            d.animate([{ transform: "scale(.4)", opacity: 1 }, { transform: "scale(1.4)", opacity: 0 }], { duration: 600, easing: "ease-out", fill: "forwards" });
            setTimeout(() => d.remove(), 700);
          },
          [x, y, TAP_STYLE] as const,
        );
      }
      await pause(350);
      await target.click();
      await pause(900);
    } catch {
      console.warn("  ! skipped a tap (button not found; the design may have changed):", String(target));
    }
  },
  type: async (target, text) => {
    await target.pressSequentially(text, { delay: 55 }).catch(() => console.warn("  ! couldn't type into", String(target)));
  },
  scroll: async (dy) => {
    await page.mouse.wheel(0, dy);
    await pause(1100);
  },
  segment: async (id, steps) => {
    const start = now();
    await steps();
    segments[id] = [start, now()];
  },
};

const T = TOURS[role];
await page.setContent(card(T.title, role === "coach" ? "For coaches" : "For athletes"));
await pause(2500);
const introEnd = now();
await T.run(tour);
const outroStart = now();
await page.setContent(card("Built between the beats.", "diastole.app"));
await pause(2500);

await cdp.send("Page.stopScreencast").catch(() => {});
const endT = now();
await ctx.close();
await browser.close();

// Frames → a steady 30 fps video: each frame holds until the next one arrived.
const first = frames[0]?.t ?? 0;
// Keep at most one frame per 1/30 s, each holding until the next kept one.
const kept = frames.reduce<typeof frames>((acc, f) => (acc.length && f.t - acc[acc.length - 1].t < 1 / 30 ? acc : [...acc, f]), []);
const lines: string[] = [];
kept.forEach((f, i) => {
  const next = kept[i + 1]?.t ?? Math.max(f.t + 1 / 30, first + (endT - Math.max(0, first - t0 / 1000)));
  lines.push(`file '${f.file.split("/").pop()}'`, `duration ${(next - f.t).toFixed(4)}`);
});
lines.push(`file '${kept.at(-1)!.file.split("/").pop()}'`);
writeFileSync(join(FRAMES, "list.txt"), lines.join("\n"));
const raw = join(OUT, `${role}.mp4`);
// The size Chrome actually captured (middle of the tour), and an output at the phone's proportions.
const mid = kept[Math.floor(kept.length / 2)].file;
const [fw] = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", mid]).toString().trim().split(",").map(Number);
const W = Math.min(1080, Math.max(fw, 720)) & ~1;
const H = Math.round((W * phone.viewport.height) / phone.viewport.width / 2) * 2;
console.log(`  captured at ${fw} px wide; video ${W}×${H}`);
execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", join(FRAMES, "list.txt"), "-vf", `fps=30,scale=${W}:${H}:flags=lanczos,setsar=1,format=yuv420p`, "-c:v", "libx264", "-crf", "18", "-preset", "fast", raw]);
rmSync(FRAMES, { recursive: true, force: true });
// Timeline zero = first frame; shift everything recorded against t0 to match.
const lag = frames.length ? Math.max(0, first - t0 / 1000) : 0;
const shift = (v: number) => Math.max(0, v - lag);
writeFileSync(
  join(OUT, `${role}.json`),
  JSON.stringify({ css: phone.viewport, introEnd: shift(introEnd), outroStart: shift(outroStart), end: shift(endT), taps: taps.map((p) => ({ ...p, t: shift(p.t) })), segments: Object.fromEntries(Object.entries(segments).map(([k, [a, b]]) => [k, [shift(a), shift(b)]])) }, null, 2),
);
console.log(`Recorded ${raw} (${endT.toFixed(0)} s, ${frames.length} frames). Next: node walkthroughs/edit.ts ${role}`);

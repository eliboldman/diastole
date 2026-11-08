// Records a walkthrough at iPhone size with Playwright, signed in as a demo account.
//
//   DEMO_ATHLETE_EMAIL=… DEMO_ATHLETE_PASSWORD=… node walkthroughs/record.ts athlete
//   DEMO_COACH_EMAIL=…   DEMO_COACH_PASSWORD=…   node walkthroughs/record.ts coach
//   BASE_URL defaults to the live site (NEXT_PUBLIC_SITE_URL in .env.local).
//
// Captions, tap ripples and the intro/outro cards are drawn in the page itself, so the video needs
// no text rendering later. Writes walkthroughs/out/<role>.webm and <role>.json (tap times and
// positions for zooms, and where each feature segment starts and ends for the short clips).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
const email = env(role === "coach" ? "DEMO_COACH_EMAIL" : "DEMO_ATHLETE_EMAIL");
const password = env(role === "coach" ? "DEMO_COACH_PASSWORD" : "DEMO_ATHLETE_PASSWORD");
if (!email || !password) {
  console.error(`Set ${role === "coach" ? "DEMO_COACH_EMAIL and DEMO_COACH_PASSWORD" : "DEMO_ATHLETE_EMAIL and DEMO_ATHLETE_PASSWORD"} first.`);
  process.exit(1);
}

const OUT = join("walkthroughs", "out");
mkdirSync(OUT, { recursive: true });
const phone = devices["iPhone 15 Pro"];
const VIDEO = { width: phone.viewport.width * 2, height: phone.viewport.height * 2 };

// Drawn in the page: a caption bar and tap ripples, in the app's own look.
const OVERLAY = `
(() => {
  if (window.__wt) return;
  window.__wt = true;
  const style = document.createElement("style");
  style.textContent = \`
    #wt-cap{position:fixed;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom) + 88px);z-index:2147483647;padding:14px 16px;border-radius:18px;
      background:rgba(6,10,9,.86);border:1px solid rgba(255,255,255,.14);color:#fff;font:600 17px/1.35 -apple-system,system-ui,sans-serif;text-align:center;
      box-shadow:0 10px 40px rgba(0,0,0,.5);opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s;pointer-events:none}
    #wt-cap.on{opacity:1;transform:none}
    .wt-tap{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid rgba(255,255,255,.9);z-index:2147483647;pointer-events:none;
      animation:wt-tap .6s ease-out forwards}
    @keyframes wt-tap{from{transform:scale(.4);opacity:1}to{transform:scale(1.4);opacity:0}}\`;
  document.documentElement.appendChild(style);
})();`;

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

const browser = await chromium.launch();
// Sign in without recording, then record with the saved session.
const login = await browser.newContext({ ...phone });
const lp = await login.newPage();
await lp.goto(`${BASE}/login`);
await lp.locator('input[name="email"]').fill(email);
await lp.locator('input[name="password"]').fill(password);
await lp.getByRole("button", { name: "Sign in", exact: true }).click();
await lp.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
const state = await login.storageState();
await login.close();

const ctx = await browser.newContext({ ...phone, storageState: state, recordVideo: { dir: OUT, size: VIDEO } });
await ctx.addInitScript(OVERLAY);
const page = await ctx.newPage();
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const taps: { t: number; x: number; y: number }[] = [];
const segments: Record<string, [number, number]> = {};
const scale = VIDEO.width / phone.viewport.width;
const pause = (ms: number) => page.waitForTimeout(ms);

const tour: Tour = {
  page,
  go: async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => {});
    await pause(700);
  },
  caption: async (text, ms) => {
    await page.evaluate((txt) => {
      let el = document.getElementById("wt-cap");
      if (!el) {
        el = document.createElement("div");
        el.id = "wt-cap";
        document.body.appendChild(el);
      }
      el.textContent = txt;
      requestAnimationFrame(() => el!.classList.add("on"));
    }, text);
    await pause(ms);
    await page.evaluate(() => document.getElementById("wt-cap")?.classList.remove("on"));
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
        await page.evaluate(([px, py]) => {
          const d = document.createElement("div");
          d.className = "wt-tap";
          d.style.left = `${px}px`;
          d.style.top = `${py}px`;
          document.body.appendChild(d);
          setTimeout(() => d.remove(), 700);
        }, [x, y]);
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

const video = page.video();
await ctx.close();
await browser.close();
const file = await video!.path();
renameSync(file, join(OUT, `${role}.webm`));
writeFileSync(join(OUT, `${role}.json`), JSON.stringify({ size: VIDEO, introEnd, outroStart, end: now(), taps, segments }, null, 2));
console.log(`Recorded ${join(OUT, `${role}.webm`)} (${now().toFixed(0)} s). Next: node walkthroughs/edit.ts ${role}`);

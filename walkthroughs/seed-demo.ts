// Sets up the two demo accounts the walkthroughs are recorded with, in one go:
//
//   node walkthroughs/seed-demo.ts
//
// 1. Creates (or resets) demo-coach@example.com and demo-athlete@example.com with random passwords.
//    example.com addresses never receive email; nothing is sent.
// 2. Makes the first a coach and the second their athlete ("Sam Demo"). Separate from real coaches,
//    so no real athlete ever appears in a video.
// 3. Gives Sam sample training: a missed session yesterday, today's workout, two later this week,
//    a few finished runs, today's readiness and a recovery routine. Safe to re-run.
// 4. Signs both in and saves the sessions to walkthroughs/out/<role>.state.json (git-ignored), so
//    the recorder never has to type a password into the site.
//
// Uses the service key from .env.local. Passwords and sessions are written only to walkthroughs/out/.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "")
    .split("\n")
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SECRET_KEY;
const PUBLIC_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SITE = (process.env.BASE_URL || env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
if (!URL_ || !KEY || !PUBLIC_KEY) {
  console.error("Missing Supabase settings in .env.local");
  process.exit(1);
}
const admin = createClient(URL_, KEY, { auth: { persistSession: false } });
const OUT = join("walkthroughs", "out");
mkdirSync(OUT, { recursive: true });

const ACCOUNTS = {
  coach: { email: "demo-coach@example.com", name: "Demo Coach" },
  athlete: { email: "demo-athlete@example.com", name: "Sam Demo" },
} as const;

async function ensureUser(email: string, name: string, password: string): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = list?.users.find((u) => u.email === email);
  if (found) {
    await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true, user_metadata: { full_name: name } });
    return found.id;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (error || !data.user) throw new Error(`Couldn't create ${email}: ${error?.message}`);
  return data.user.id;
}

const passwords = { coach: randomBytes(18).toString("base64url"), athlete: randomBytes(18).toString("base64url") };
const coachId = await ensureUser(ACCOUNTS.coach.email, ACCOUNTS.coach.name, passwords.coach);
const athleteId = await ensureUser(ACCOUNTS.athlete.email, ACCOUNTS.athlete.name, passwords.athlete);
// The sign-up trigger makes the profile rows; give it a moment.
await new Promise((r) => setTimeout(r, 1500));
let e = (await admin.from("profiles").update({ role: "coach", coach_id: coachId, full_name: ACCOUNTS.coach.name, welcomed_at: new Date().toISOString() }).eq("id", coachId)).error;
if (e) throw new Error(`Coach profile: ${e.message}`);
e = (await admin.from("profiles").update({ role: "athlete", coach_id: coachId, full_name: ACCOUNTS.athlete.name, welcomed_at: new Date().toISOString() }).eq("id", athleteId)).error;
if (e) throw new Error(`Athlete profile: ${e.message}`);
console.log("✓ Demo coach and athlete ready");

// ---------------------------------------------------------------- sample training
const tz = "America/Chicago";
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-CA", { timeZone: tz });
const time = (seconds: number, intensity: string, target?: object) => ({ kind: "step", intensity, duration: { type: "time", seconds }, ...(target ? { target } : {}) });
const z = (zone: number) => ({ type: "hr_zone", zone });
const pace = (fast: number, slow: number) => ({ type: "pace_range", fastSecPerKm: fast, slowSecPerKm: slow });

await admin.from("planned_workouts").delete().eq("athlete_id", athleteId);
await admin.from("activities").delete().eq("athlete_id", athleteId);
await admin.from("recovery_assignments").delete().eq("athlete_id", athleteId);

const now = new Date().toISOString();
const workouts = [
  { d: -1, title: "Easy 40 min", steps: [time(2400, "ACTIVE", z(2))] },
  { d: 0, title: "Tempo 3 × 10 min", steps: [time(900, "WARMUP", z(2)), { kind: "repeat", times: 3, steps: [time(600, "INTERVAL", pace(255, 265)), time(120, "RECOVERY", z(1))] }, time(600, "COOLDOWN", z(1))] },
  { d: 2, title: "6 × 800 m at 5K pace", steps: [time(900, "WARMUP", z(2)), { kind: "repeat", times: 6, steps: [{ kind: "step", intensity: "INTERVAL", duration: { type: "distance", meters: 800 }, target: pace(230, 240) }, time(120, "RECOVERY", z(1))] }, time(600, "COOLDOWN", z(1))] },
  { d: 4, title: "Long run 75 min", steps: [time(4500, "ACTIVE", z(2))] },
];
e = (
  await admin.from("planned_workouts").insert(
    workouts.map((w) => ({ athlete_id: athleteId, coach_id: coachId, scheduled_date: day(w.d), sport: "run", title: w.title, steps: w.steps, status: "approved", approved_at: now, why: w.d === 0 ? "Builds your threshold for the spring half." : null })),
  )
).error;
if (e) throw new Error(`Workouts: ${e.message}`);

const runs = [3, 4, 6].map((n, i) => ({
  athlete_id: athleteId,
  source: "upload",
  external_id: `demo-run-${i}`,
  sport: "running",
  name: ["Easy run", "Hills", "Long run"][i],
  start_time: new Date(Date.now() - n * 86_400_000 + 7 * 3600_000).toISOString(),
  duration_s: [2700, 3300, 5400][i],
  distance_m: [7600, 9100, 15800][i],
  avg_hr: [138, 151, 142][i],
  max_hr: [152, 176, 160][i],
}));
e = (await admin.from("activities").insert(runs)).error;
if (e) throw new Error(`Activities: ${e.message}`);

await admin.from("readiness_scores").upsert({ athlete_id: athleteId, date: day(0), overall: "green", recovery: "green", sleep: "green", stress: "yellow", load: "green", note: "Recovered and ready. A good day for today's tempo." });
await admin.from("recovery_assignments").insert({ athlete_id: athleteId, coach_id: coachId, title: "Calf and soleus reset", items: [{ slug: "foam-roll-calves", seconds: 45 }, { slug: "ball-soleus", seconds: 45 }, { slug: "stretch-wall-calf-straight", seconds: 30 }, { slug: "stretch-wall-calf-bent", seconds: 30 }], scheduled_date: day(0) });
console.log("✓ Sample training added");

// ---------------------------------------------------------------- sessions for the recorder
const host = new URL(SITE).hostname;
for (const role of ["coach", "athlete"] as const) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(URL_, PUBLIC_KEY, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const c of list) {
          const i = jar.findIndex((x) => x.name === c.name);
          if (i >= 0) jar.splice(i, 1);
          if (c.value) jar.push({ name: c.name, value: c.value });
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: ACCOUNTS[role].email, password: passwords[role] });
  if (error) throw new Error(`Signing in ${role}: ${error.message}`);
  const state = {
    cookies: jar.map((c) => ({ name: c.name, value: c.value, domain: host, path: "/", expires: Math.floor(Date.now() / 1000) + 7 * 86400, httpOnly: false, secure: SITE.startsWith("https"), sameSite: "Lax" as const })),
    origins: [],
  };
  writeFileSync(join(OUT, `${role}.state.json`), JSON.stringify(state), { mode: 0o600 });
}
writeFileSync(join(OUT, "demo-accounts.txt"), `demo-coach@example.com  ${passwords.coach}\ndemo-athlete@example.com  ${passwords.athlete}\n`, { mode: 0o600 });
console.log(`✓ Signed-in sessions saved for ${host} (walkthroughs/out/, not in git)`);
console.log("Done. Tell Claude to record the walkthroughs.");

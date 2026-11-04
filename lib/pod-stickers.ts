// Pod props & heckles. Pure: used by the pod page (server) and the sticker sheet (browser).
// Secret stickers only appear when the recipient's own numbers earn them.

export type Tone = "props" | "heckle";
export type Sticker = { key: string; emoji: string; label: string; tone: Tone; line?: string; secret?: boolean };

export type MemberData = {
  readiness: { overall: string } | null;
  wellness: { date: string; hrv_ms: number | null; sleep_seconds: number | null; stress_avg: number | null }[];
  activities: { start_time: string; duration_s: number | null }[];
};

const ALWAYS: Sticker[] = [
  { key: "goat", emoji: "🐐", label: "GOAT behavior", tone: "props" },
  { key: "fire", emoji: "🔥", label: "Legs of steel", tone: "props" },
  { key: "salute", emoji: "🫡", label: "Respect the grind", tone: "props" },
  { key: "rocket", emoji: "🚀", label: "Built different", tone: "props" },
  { key: "clap", emoji: "👏", label: "Standing ovation", tone: "props" },
  { key: "heart", emoji: "🫀", label: "Big heart (literally)", tone: "props" },
  { key: "salt", emoji: "🧂", label: "Salty", tone: "heckle" },
  { key: "snail", emoji: "🐌", label: "Snail mode", tone: "heckle" },
  { key: "rip", emoji: "🪦", label: "RIP legs", tone: "heckle" },
  { key: "clown", emoji: "🤡", label: "Clown behavior", tone: "heckle" },
  { key: "sloth", emoji: "🦥", label: "Sloth mode", tone: "heckle" },
  { key: "potato", emoji: "🥔", label: "Couch potato", tone: "heckle" },
];

// Every secret sticker, so labels resolve even after the numbers that unlocked it change.
const SECRETS: Record<string, Sticker> = Object.fromEntries(
  (
    [
      ["blink", "😵‍💫", "Blink-sleeper", "heckle"],
      ["royal", "👑", "Sleep royalty", "props"],
      ["zen", "🧘", "Zen master", "props"],
      ["volcano", "🌋", "Cortisol volcano", "heckle"],
      ["lungs", "🫁", "Iron lungs", "props"],
      ["complaint", "📉", "HRV said no", "heckle"],
      ["couch", "🛋️", "Couch sponsorship", "heckle"],
      ["unhinged", "🥵", "Unhinged volume", "props"],
      ["sendhelp", "🚑", "Send help", "heckle"],
      ["greenlight", "🟢", "Green light gang", "props"],
    ] as const
  ).map(([key, emoji, label, tone]) => [key, { key, emoji, label, tone, secret: true }]),
);

export const ALL_STICKERS: Record<string, Sticker> = { ...Object.fromEntries(ALWAYS.map((s) => [s.key, s])), ...SECRETS };
export const isSticker = (key: string) => key in ALL_STICKERS;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const hm = (s: number) => `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`;

/** Secret stickers this member's data unlocks right now, each with a line written from their numbers. */
export function unlockedFor(m: MemberData, now = new Date()): Sticker[] {
  const out: Sticker[] = [];
  const add = (key: string, line: string) => out.push({ ...SECRETS[key], line });
  const days = [...m.wellness].sort((a, b) => a.date.localeCompare(b.date));
  const last = days.at(-1);

  if (last?.sleep_seconds) {
    if (last.sleep_seconds < 6 * 3600) add("blink", `${hm(last.sleep_seconds)} of sleep? That wasn't sleep, that was a long blink.`);
    if (last.sleep_seconds >= 8.5 * 3600) add("royal", `${hm(last.sleep_seconds)} of sleep. Absolutely regal.`);
  }
  if (last?.stress_avg != null) {
    if (last.stress_avg <= 20) add("zen", `Stress ${last.stress_avg}. Who hurt your cortisol? Nobody.`);
    if (last.stress_avg >= 45) add("volcano", `Stress ${last.stress_avg}. Go touch grass, immediately.`);
  }
  const hrvBase = avg(days.slice(0, -1).flatMap((d) => (d.hrv_ms ? [d.hrv_ms] : [])));
  if (last?.hrv_ms && hrvBase) {
    const pct = Math.round((last.hrv_ms / hrvBase - 1) * 100);
    if (pct >= 10) add("lungs", `HRV up ${pct}%. Nervous system is on vacation.`);
    if (pct <= -15) add("complaint", `HRV down ${-pct}%. Your body filed a formal complaint.`);
  }
  const latest = m.activities.reduce((t, a) => Math.max(t, Date.parse(a.start_time)), 0);
  const idleDays = latest ? Math.floor((now.getTime() - latest) / 86_400_000) : null;
  if (idleDays !== null && idleDays >= 4) add("couch", `${idleDays} days without a workout. The couch sends its regards.`);
  const weekMin = m.activities
    .filter((a) => now.getTime() - Date.parse(a.start_time) < 7 * 86_400_000)
    .reduce((t, a) => t + (a.duration_s ?? 0) / 60, 0);
  if (weekMin >= 300) add("unhinged", `${Math.round(weekMin / 60)} hours of training this week. Are you okay?`);
  if (m.readiness?.overall === "red") add("sendhelp", "Readiness is red. Somebody bring this athlete a smoothie.");
  if (m.readiness?.overall === "green") add("greenlight", "Readiness is green. Fully charged and dangerous.");
  return out;
}

export const ALWAYS_STICKERS = ALWAYS;

/** The caption that pops up as a held sticker's count climbs. */
export function milestone(n: number): string | null {
  if (n >= 1_000_000) return "MAXED OUT. Please go outside.";
  if (n >= 100_000) return "the server is sweating";
  if (n >= 10_000) return "legally a menace";
  if (n >= 1_000) return "absolutely unhinged";
  if (n >= 100) return "ok calm down";
  if (n >= 10) return "combo!";
  return null;
}

/** Press-and-hold: how many to add on each tick, given how long it's been held. Hits ~15k by 4.5 s. */
export function rampStep(heldMs: number): number {
  if (heldMs < 600) return 1;
  if (heldMs < 1500) return 3;
  if (heldMs < 2500) return 37;
  if (heldMs < 3500) return 373;
  if (heldMs < 4500) return 877;
  return 4_999;
}
export const MAX_SEND = 1_000_000;

// ---------------------------------------------------------------- weekly pod awards

export type AwardMember = MemberData & { id: string; name: string };
export type Award = { title: string; emoji: string; winner: string; detail: string };

/** Superlatives from the last 7 days. Each needs at least two members with data, or it's skipped. */
export function podAwards(members: AwardMember[], now = new Date()): Award[] {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const stat = (f: (m: AwardMember) => number | null) =>
    members.flatMap((m) => {
      const v = f(m);
      return v === null || !Number.isFinite(v) ? [] : [{ m, v }];
    });
  const week = (m: AwardMember, k: "sleep_seconds" | "stress_avg" | "hrv_ms") =>
    avg(m.wellness.filter((d) => d.date >= cutoff && d[k] != null).map((d) => d[k] as number));
  const pick = (rows: { m: AwardMember; v: number }[], best: "max" | "min") =>
    rows.length < 2 ? null : rows.reduce((a, b) => ((best === "max" ? b.v > a.v : b.v < a.v) ? b : a));

  const awards: Award[] = [];
  const sleep = stat((m) => week(m, "sleep_seconds"));
  const royal = pick(sleep, "max");
  if (royal) awards.push({ title: "Sleep Royalty", emoji: "👑", winner: royal.m.name, detail: `${hm(royal.v)} a night` });
  const vamp = pick(sleep, "min");
  if (vamp && vamp.m !== royal?.m) awards.push({ title: "Vampire Award", emoji: "🧛", winner: vamp.m.name, detail: `${hm(vamp.v)} a night. Sunlight optional.` });
  const zen = pick(stat((m) => week(m, "stress_avg")), "min");
  if (zen) awards.push({ title: "Most Zen", emoji: "🧘", winner: zen.m.name, detail: `average stress ${Math.round(zen.v)}` });
  const lungs = pick(
    stat((m) => {
      const recent = week(m, "hrv_ms");
      const before = avg(m.wellness.filter((d) => d.date < cutoff && d.hrv_ms != null).map((d) => d.hrv_ms as number));
      return recent && before ? (recent / before - 1) * 100 : null;
    }),
    "max",
  );
  if (lungs && lungs.v > 0) awards.push({ title: "Iron Lungs", emoji: "🫁", winner: lungs.m.name, detail: `HRV up ${Math.round(lungs.v)}%` });
  const grind = pick(
    stat((m) => m.activities.filter((a) => a.start_time.slice(0, 10) >= cutoff).reduce((t, a) => t + (a.duration_s ?? 0) / 60, 0)),
    "max",
  );
  if (grind && grind.v > 0) awards.push({ title: "Grindset", emoji: "⚙️", winner: grind.m.name, detail: `${Math.round(grind.v)} minutes of training` });
  return awards;
}

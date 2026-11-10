// The Secrets collection: what can be found, the cryptic hint shown while it's locked, and how it
// was found once it isn't. Playful, original, never about nutrition, weight or health. Pure.

export type SecretId = "blocks" | "icarus" | "heartbeat" | "night_shift" | "receipt";
export type Secret = { id: SecretId; name: string; emoji: string; hint: string; found: string; tiers?: number[] };

export const SECRETS: Secret[] = [
  { id: "night_shift", name: "Night Shift", emoji: "🌙", hint: "Some runs happen while the world sleeps.", found: "A workout between midnight and 4 a.m. Unlocks a starry sky for the day.", tiers: [1, 10, 25] },
  { id: "heartbeat", name: "Heartbeat", emoji: "🫀", hint: "Hold the heart a little longer.", found: "Long-press the logo: it beats at your resting heart rate." },
  { id: "receipt", name: "Retro Receipt", emoji: "🧾", hint: "Every finished workout leaves a paper trail.", found: "Long-press the numbers on a finished workout for a receipt to share." },
  { id: "blocks", name: "Blocks", emoji: "🧱", hint: "Some things are built one tap at a time.", found: "Tap the heart in Appearance five times for a pixel theme." },
  { id: "icarus", name: "Icarus", emoji: "☀️", hint: "Search for the one who flew too high.", found: "Type “icarus” into search for a sun-gold theme and a secret sticker." },
];
export const secretById = (id: string) => SECRETS.find((s) => s.id === id) ?? null;

/** Night Shift tier for a count of night sessions: 0 (none), 1, 2 or 3. */
export const tierOf = (s: Secret, count: number) => (s.tiers ?? [1]).filter((t) => count >= t).length;

// ---------------------------------------------------------------- settings

export type Eggs = { on: boolean; podPosts: boolean; heartbeat: "soft" | "sharp" | "pixel" | "off"; night: "day" | "keep" };
export const DEFAULT_EGGS: Eggs = { on: true, podPosts: false, heartbeat: "soft", night: "day" };
export function cleanEggs(raw: unknown): Eggs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
  return {
    on: typeof r.on === "boolean" ? r.on : DEFAULT_EGGS.on,
    podPosts: typeof r.podPosts === "boolean" ? r.podPosts : DEFAULT_EGGS.podPosts,
    heartbeat: pick(r.heartbeat, ["soft", "sharp", "pixel", "off"] as const, DEFAULT_EGGS.heartbeat),
    night: pick(r.night, ["day", "keep"] as const, DEFAULT_EGGS.night),
  };
}

// The cookie the pages read to draw eggs at once: settings + which secrets are found (and on).
export const EGGS_COOKIE = "d_eggs";
export type EggState = Eggs & { found: string[] };
export const eggCookie = (s: EggState) => encodeURIComponent(JSON.stringify(s));
export function eggsFromCookie(v: string | undefined): EggState {
  try {
    const r = JSON.parse(decodeURIComponent(v ?? ""));
    return { ...cleanEggs(r), found: Array.isArray(r?.found) ? r.found.filter((x: unknown) => typeof x === "string").slice(0, 40) : [] };
  } catch {
    return { ...DEFAULT_EGGS, found: [] };
  }
}

/** Local hour 0-3: the Night Shift window. */
export const isNightSession = (startIso: string, timeZone: string) => Number(new Date(startIso).toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone })) < 4;

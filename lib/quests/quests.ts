// Rest day quests: 1-3 small, optional recovery missions on days with no session planned. Pure rules
// (tested in quests.test.ts). Never about food amounts, calories or weight; skipping costs nothing.

export type Quest = {
  key: string; // catalog key, or "c:<uuid>" for a coach's own quest
  title: string;
  blurb: string;
  grit: number;
  auto?: "walk" | "recovery"; // ticks itself off from the watch or a finished recovery routine
  href?: string;
  coach?: boolean;
};

export const QUEST_GRIT = 10;

export const CATALOG: Quest[] = [
  { key: "walk_outside", title: "Easy walk outside", blurb: "20 minutes, no pace, no checking your watch.", grit: QUEST_GRIT, auto: "walk" },
  { key: "mobility", title: "Mobility session", blurb: "Any recovery routine. Ten minutes is plenty.", grit: QUEST_GRIT, auto: "recovery", href: "/recovery" },
  { key: "early_lights", title: "Lights out early", blurb: "Head to bed 30 minutes before your usual time tonight.", grit: QUEST_GRIT },
  { key: "friends_meal", title: "Share a meal with friends", blurb: "Good company. Training talk optional.", grit: QUEST_GRIT },
  { key: "legs_up", title: "Legs up the wall", blurb: "Ten minutes with your feet up. Bring a podcast.", grit: QUEST_GRIT },
  { key: "daylight", title: "Morning daylight", blurb: "Ten minutes outside before noon.", grit: QUEST_GRIT },
  { key: "kit_ready", title: "Lay out tomorrow's kit", blurb: "Future you says thanks.", grit: QUEST_GRIT },
  { key: "gear_care", title: "Show your gear some love", blurb: "Wipe a chain, rinse your bottles, or air out your shoes.", grit: QUEST_GRIT },
  { key: "no_screens", title: "Screens off before bed", blurb: "The last hour before sleep, phone in another room.", grit: QUEST_GRIT },
  { key: "breathe", title: "Five slow minutes", blurb: "Breathe in for 4, out for 6. That's it.", grit: QUEST_GRIT },
  { key: "catch_up", title: "Catch up with someone", blurb: "Call or visit someone you've been meaning to.", grit: QUEST_GRIT },
  { key: "find_green", title: "Find some green", blurb: "Sit in a park, a garden, anywhere with trees.", grit: QUEST_GRIT },
];
const BY_KEY = new Map(CATALOG.map((q) => [q.key, q]));
export const catalogQuest = (key: string) => BY_KEY.get(key);

export type CustomQuest = { id: string; title: string; blurb: string | null; grit: number; athlete_id: string | null; created_at: string };

/**
 * A rest day: nothing planned today, while the athlete does have a plan around it (so people without
 * a coach's plan don't get quests every day), and not in sick/injured mode (rest there is its own thing).
 */
export function isRestDay(o: { plannedToday: number; plannedNearby: number; paused: boolean }) {
  return !o.paused && o.plannedToday === 0 && o.plannedNearby > 0;
}

// Small stable hash (FNV-1a), so the same athlete gets the same quests all day.
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Today's quests: one of the coach's own (theirs for this athlete first), then picks from the catalog. 2-3 total. */
export function questsFor(athleteId: string, date: string, custom: CustomQuest[]): Quest[] {
  const mine = [...custom].sort((a, b) => Number(Boolean(b.athlete_id)) - Number(Boolean(a.athlete_id)) || b.created_at.localeCompare(a.created_at));
  const out: Quest[] = [];
  if (mine.length) {
    // Rotate through the coach's quests day by day.
    const c = mine[hash(`${athleteId}:${date}:c`) % mine.length];
    out.push({ key: `c:${c.id}`, title: c.title, blurb: c.blurb ?? "From your coach.", grit: c.grit, coach: true });
  }
  const pool = [...CATALOG];
  const want = out.length ? 3 : 2;
  let seed = hash(`${athleteId}:${date}`);
  while (out.length < want && pool.length) {
    const q = pool.splice(seed % pool.length, 1)[0];
    out.push(q);
    seed = hash(`${seed}`);
  }
  return out;
}

/** Quests that count themselves from today's data. */
export function autoDone(q: Quest, today: { walkMinutes: number; recoveryDone: boolean }) {
  if (q.auto === "walk") return today.walkMinutes >= 18;
  if (q.auto === "recovery") return today.recoveryDone;
  return false;
}

/** Coach quests stay recovery-shaped: no calories, weight, dieting or fasting. Returns a reason, or null if fine. */
export function questTextProblem(title: string, blurb: string) {
  const t = `${title} ${blurb}`;
  if (!title.trim() || title.trim().length > 60) return "Give it a short title (up to 60 characters).";
  if (blurb.length > 140) return "Keep the description to 140 characters.";
  if (/calor|kcal|\bweigh(?!ts\b)|weight[\s-]*(loss|gain|cut)|\bdiet|fasting|\bfast\b|\bbmi\b|\blbs?\b|\bpounds?\b|skip\w*\s+(a\s+|your\s+)?(meal|breakfast|lunch|dinner)|\bburn\b|macros?\b/i.test(t))
    return "Rest day quests stay about recovery, so nothing on calories, weight, dieting or fasting.";
  return null;
}

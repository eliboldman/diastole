// The recovery exercise catalog: the moves the coach's demo clips show. Clip filenames are matched
// to these ids (see matchSlug). Pure, for tests. General recovery guidance, not medical treatment.

export type Equipment = "foam roller" | "massage ball" | "strap" | "none";
export type Area =
  | "quads" | "hamstrings" | "it band" | "glutes" | "piriformis" | "calves" | "soleus"
  | "adductors" | "foot arch" | "upper back" | "hip flexors" | "hips" | "breathing";
export type Move = {
  slug: string;
  name: string;
  equipment: Equipment;
  areas: Area[];
  seconds: number; // default, per side when perSide
  perSide: boolean;
  cue: string;
  pattern?: "box"; // a guided breathing pattern instead of a clip
};

export const MOVES: Move[] = [
  { slug: "foam-roll-quads", name: "Foam roll quads", equipment: "foam roller", areas: ["quads"], seconds: 45, perSide: true, cue: "Face down, roller under the thigh. Slow passes hip to just above the knee; pause on tight spots." },
  { slug: "foam-roll-hamstrings", name: "Foam roll hamstrings", equipment: "foam roller", areas: ["hamstrings"], seconds: 45, perSide: true, cue: "Sit on the roller, other leg crossed on top. Roll from the glute crease to behind the knee." },
  { slug: "foam-roll-it-band", name: "Foam roll IT band", equipment: "foam roller", areas: ["it band"], seconds: 45, perSide: true, cue: "On your side, top foot planted in front to control pressure. Roll the outer thigh, hip to knee." },
  { slug: "foam-roll-glutes", name: "Foam roll glutes", equipment: "foam roller", areas: ["glutes"], seconds: 45, perSide: true, cue: "Sit on the roller, ankle over the opposite knee, lean into that side. Small circles." },
  { slug: "foam-roll-calves", name: "Foam roll calves", equipment: "foam roller", areas: ["calves"], seconds: 45, perSide: true, cue: "Roller under the calf, other leg on top for more pressure. Ankle to just below the knee." },
  { slug: "foam-roll-adductors", name: "Foam roll adductors", equipment: "foam roller", areas: ["adductors"], seconds: 45, perSide: true, cue: "Face down, one knee out to the side on the roller. Roll the inner thigh in short strokes." },
  { slug: "foam-roll-upper-back", name: "Foam roll upper back", equipment: "foam roller", areas: ["upper back"], seconds: 60, perSide: false, cue: "Roller across the upper back, hands behind your head, hips down. Roll shoulder blades to mid back." },
  { slug: "ball-soleus", name: "Ball: soleus and lower calf", equipment: "massage ball", areas: ["soleus", "calves"], seconds: 45, perSide: true, cue: "Ball under the lower calf, knee bent. Small side-to-side sweeps above the Achilles, not on it." },
  { slug: "ball-foot-arch", name: "Ball: foot arch", equipment: "massage ball", areas: ["foot arch"], seconds: 45, perSide: true, cue: "Standing, ball under the arch. Slow rolls heel to toes with comfortable pressure." },
  { slug: "ball-glute-piriformis", name: "Ball: glute and piriformis", equipment: "massage ball", areas: ["piriformis", "glutes"], seconds: 45, perSide: true, cue: "Sit with the ball under the side of your glute. Let it sink in, then small circles." },
  { slug: "stretch-hip-flexor-lunge", name: "Hip flexor lunge stretch", equipment: "none", areas: ["hip flexors", "hips"], seconds: 45, perSide: true, cue: "Half-kneeling, tuck your hips under and squeeze the back glute. Lean forward gently, tall chest." },
  { slug: "stretch-wall-calf-straight", name: "Wall calf stretch, straight knee", equipment: "none", areas: ["calves"], seconds: 30, perSide: true, cue: "Hands on the wall, back leg straight, heel down. Lean in until you feel the upper calf." },
  { slug: "stretch-wall-calf-bent", name: "Wall calf stretch, bent knee", equipment: "none", areas: ["soleus", "calves"], seconds: 30, perSide: true, cue: "Same as before but bend the back knee, heel still down. You'll feel it lower, toward the Achilles." },
  { slug: "stretch-strap-hamstring", name: "Strap hamstring stretch", equipment: "strap", areas: ["hamstrings"], seconds: 45, perSide: true, cue: "On your back, strap around the foot. Raise the straight leg until you feel a stretch; breathe and relax into it." },
  { slug: "stretch-pigeon", name: "Pigeon stretch", equipment: "none", areas: ["glutes", "piriformis", "hips"], seconds: 45, perSide: true, cue: "Front shin across, back leg long. Hips square; fold forward only as far as feels good." },
  { slug: "stretch-figure-four", name: "Figure-four stretch", equipment: "none", areas: ["glutes", "piriformis"], seconds: 45, perSide: true, cue: "On your back, ankle over the opposite knee. Pull the bottom leg toward you." },
  { slug: "mobility-leg-swings", name: "Leg swings", equipment: "none", areas: ["hips", "hamstrings", "hip flexors"], seconds: 30, perSide: true, cue: "Hold a wall. Easy front-to-back swings, getting a little bigger each time. Then side to side." },
  { slug: "mobility-cat-cow", name: "Cat-cow", equipment: "none", areas: ["upper back"], seconds: 45, perSide: false, cue: "On hands and knees. Round up as you breathe out, let the belly drop as you breathe in. Slow." },
  { slug: "mobility-90-90", name: "90-90 hip switches", equipment: "none", areas: ["hips", "glutes"], seconds: 60, perSide: false, cue: "Sit with both knees bent at 90°. Rotate both knees to the other side and back, tall through the spine." },
  { slug: "breath-box", name: "Box breathing", equipment: "none", areas: ["breathing"], seconds: 240, perSide: false, cue: "In for 4, hold for 4, out for 4, hold for 4. Shoulders soft.", pattern: "box" },
];

export const moveBySlug = (slug: string) => MOVES.find((m) => m.slug === slug) ?? null;

/** A clip filename to a catalog id: "Foam Roll - Hamstrings (L).mov" → "foam-roll-hamstrings". */
export function matchSlug(filename: string): string | null {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").toLowerCase().replace(/\((l|r|left|right)\)|\b(left|right)\b/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (moveBySlug(base)) return base;
  const words = base.split("-").filter((w) => w.length > 1);
  let best: { slug: string; score: number } | null = null;
  for (const m of MOVES) {
    const target = new Set(`${m.slug} ${m.name}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" "));
    const hits = words.filter((w) => target.has(w)).length;
    const score = hits / Math.max(words.length, 1);
    if (hits >= 2 && score >= 0.6 && (!best || score > best.score)) best = { slug: m.slug, score };
  }
  return best?.slug ?? null;
}

// ---------------------------------------------------------------- routines

export type RoutineItem = { slug: string; seconds: number };
export type Routine = { id: string; title: string; description: string | null; items: RoutineItem[]; starter?: boolean };

/** Clean stored or submitted items: known moves only, sensible times. */
export function cleanItems(raw: unknown): RoutineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 30)
    .map((x) => {
      const r = (x ?? {}) as Record<string, unknown>;
      const m = typeof r.slug === "string" ? moveBySlug(r.slug) : null;
      if (!m) return null;
      const s = typeof r.seconds === "number" && Number.isFinite(r.seconds) ? Math.round(r.seconds) : m.seconds;
      return { slug: m.slug, seconds: Math.min(Math.max(s, 10), 900) };
    })
    .filter((x): x is RoutineItem => !!x);
}

/** Total seconds, counting both sides for per-side moves (plus a few seconds to switch). */
export function routineSeconds(items: RoutineItem[]) {
  return items.reduce((t, i) => t + (moveBySlug(i.slug)?.perSide ? i.seconds * 2 + 5 : i.seconds), 0);
}
export const minutesLabel = (sec: number) => `${Math.max(1, Math.round(sec / 60))} min`;

const r = (slug: string, seconds?: number): RoutineItem => ({ slug, seconds: seconds ?? moveBySlug(slug)!.seconds });

/** Ready-made routines, so suggestions work before the coach builds any. */
export const STARTERS: Routine[] = [
  { id: "starter-calf", title: "Calf and soleus reset", description: "For tight calves and lower legs.", starter: true, items: [r("foam-roll-calves"), r("ball-soleus"), r("stretch-wall-calf-straight"), r("stretch-wall-calf-bent")] },
  { id: "starter-foot", title: "Foot and arch", description: "For sore feet and ankles.", starter: true, items: [r("ball-foot-arch", 60), r("stretch-wall-calf-bent"), r("foam-roll-calves", 30)] },
  { id: "starter-hamstring", title: "Hamstring and glute release", description: "For tight hamstrings.", starter: true, items: [r("foam-roll-hamstrings"), r("foam-roll-glutes"), r("stretch-strap-hamstring")] },
  { id: "starter-quads", title: "Quads and outer thigh", description: "For tight quads and around the knee.", starter: true, items: [r("foam-roll-quads"), r("foam-roll-it-band"), r("stretch-hip-flexor-lunge")] },
  { id: "starter-hips", title: "Hips and low back", description: "For tight hips, glutes and a stiff low back.", starter: true, items: [r("ball-glute-piriformis"), r("stretch-figure-four"), r("stretch-pigeon"), r("stretch-hip-flexor-lunge"), r("mobility-90-90")] },
  { id: "starter-upper", title: "Upper back and shoulders", description: "For a tight upper back and neck.", starter: true, items: [r("foam-roll-upper-back", 90), r("mobility-cat-cow", 60)] },
  { id: "starter-long-run", title: "10-min post-long-run roll", description: "After long or hard sessions.", starter: true, items: [r("foam-roll-calves", 40), r("foam-roll-hamstrings", 40), r("foam-roll-quads", 40), r("foam-roll-glutes", 40), r("stretch-hip-flexor-lunge", 30)] },
  { id: "starter-mobility", title: "Easy mobility", description: "Gentle movement for a low-energy day.", starter: true, items: [r("mobility-leg-swings"), r("mobility-cat-cow"), r("mobility-90-90"), r("stretch-figure-four", 30)] },
  { id: "starter-breathe", title: "Box breathing", description: "Four calm minutes.", starter: true, items: [r("breath-box")] },
  { id: "starter-bedtime", title: "Bedtime wind-down", description: "Slow stretches, then breathing.", starter: true, items: [r("mobility-cat-cow"), r("stretch-figure-four", 40), r("stretch-strap-hamstring", 40), r("breath-box", 180)] },
];

// ---------------------------------------------------------------- suggestions

// Check-in pain spots (lib/avatar/pain.ts) to the starter routine that targets them.
const SPOT_ROUTINE: [RegExp, string][] = [
  [/^(calf|shin)_/, "starter-calf"],
  [/^(foot|ankle)_/, "starter-foot"],
  [/^hamstring_/, "starter-hamstring"],
  [/^(quad|knee)_/, "starter-quads"],
  [/^(hip|groin)_|^lower_back$/, "starter-hips"],
  [/^(upper_back|neck)$|^shoulder_/, "starter-upper"],
];

/** The routine to suggest for recent pain spots (most-flagged first), or for a low readiness day. */
export function suggestRoutine(o: { spots: string[]; readiness: string | null }): { routine: Routine; why: string } | null {
  const counts = new Map<string, number>();
  for (const s of o.spots) {
    const id = SPOT_ROUTINE.find(([re]) => re.test(s))?.[1];
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) {
    const routine = STARTERS.find((x) => x.id === top[0])!;
    const spot = o.spots.find((s) => SPOT_ROUTINE.find(([re]) => re.test(s))?.[1] === top[0])!;
    return { routine, why: `You flagged your ${spotWord(spot)} recently.` };
  }
  if (o.readiness === "red") return { routine: STARTERS.find((x) => x.id === "starter-breathe")!, why: "Readiness is low today. A few calm minutes help." };
  if (o.readiness === "yellow") return { routine: STARTERS.find((x) => x.id === "starter-mobility")!, why: "Readiness is so-so today. Keep it gentle." };
  return null;
}
const spotWord = (s: string) => s.replace(/_(l|r)$/, (_, x) => (x === "l" ? " (left)" : " (right)")).replace(/_/g, " ");

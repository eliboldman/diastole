// Starter strength plans for endurance athletes. Weights are left blank: "pick a weight you could
// lift 2–3 more times" (the coach or athlete fills them in, and progression takes it from there).

import type { StrengthItem } from "./workout.ts";

type Session = { title: string; items: StrengthItem[] };
export type Starter = { name: string; tags: string[]; weeks: number; notes: Record<string, string>; description: string; schedule: { weeks: number[]; day: number; session: Session }[] };

const PICK = "Pick a weight you could lift 2–3 more times.";
const x = (slug: string, sets: number, reps: number | null, rest_s = 60, seconds: number | null = null, note: string | null = null): StrengthItem => ({ slug, sets, reps, seconds, kg: null, tempo: null, rest_s, note });

const offA1: Session = { title: "Strength A: legs and core", items: [x("back-squat", 3, 8, 120, null, PICK), x("rdl", 3, 8, 120, null, PICK), x("split-squat", 2, 8, 90), x("single-leg-calf-raise", 3, 12, 45), x("side-plank", 2, null, 30, 30), x("dead-bug", 2, 10, 30)] };
const offB1: Session = { title: "Strength B: posterior chain and upper", items: [x("step-up", 3, 8, 90, null, PICK), x("hip-thrust", 3, 10, 90, null, PICK), x("nordic-curl", 3, 5, 90), x("one-arm-row", 3, 10, 60), x("push-up", 3, 10, 60), x("pallof-press", 2, 10, 30)] };
const offA2: Session = { title: "Strength A: heavier legs", items: [x("back-squat", 4, 5, 150, null, PICK), x("rdl", 4, 6, 120, null, PICK), x("split-squat", 3, 6, 90), x("calf-raise", 3, 12, 60, null, PICK), x("copenhagen", 2, null, 45, 20), x("plank", 2, null, 30, 45)] };
const offB2: Session = { title: "Strength B: power and pull", items: [x("box-jump", 3, 5, 90), x("step-up", 4, 6, 90, null, PICK), x("hip-thrust", 4, 8, 90, null, PICK), x("nordic-curl", 3, 6, 90), x("pull-up", 3, 6, 90), x("face-pull", 2, 15, 45)] };

const maint: Session = { title: "Strength maintenance", items: [x("goblet-squat", 2, 6, 90, null, "Heavy but crisp; stop well short of failure."), x("single-leg-rdl", 2, 6, 60), x("calf-raise", 2, 12, 45), x("copenhagen", 2, null, 30, 20), x("side-plank", 2, null, 30, 30), x("one-arm-row", 2, 8, 60)] };

const resA: Session = { title: "Resilience A: hips and calves", items: [x("band-walk", 2, 15, 30), x("clamshell", 2, 15, 30), x("single-leg-bridge", 3, 10, 45), x("single-leg-calf-raise", 3, 15, 45), x("dead-bug", 2, 10, 30), x("side-plank", 2, null, 30, 30)] };
const resB: Session = { title: "Resilience B: hamstrings and trunk", items: [x("nordic-curl", 2, 5, 90, null, "Lower as slowly as you can; catch yourself with your hands."), x("copenhagen", 2, null, 45, 20), x("seated-calf-raise", 3, 15, 45, null, PICK), x("bird-dog", 2, 8, 30), x("back-extension", 2, 10, 30), x("pallof-press", 2, 10, 30)] };

export const STARTERS: Starter[] = [
  {
    name: "Off-season strength (8 weeks)",
    tags: ["strength", "off-season", "8 weeks"],
    weeks: 8,
    description: "Two sessions a week: build general strength, then heavier and more powerful from week 5. Keep them away from the day before key sessions.",
    notes: { "1": "Learn the moves, moderate weights", "4": "Repeat week 3, a touch heavier", "5": "Heavier: fewer reps, longer rests", "8": "Lighter week to absorb it" },
    schedule: [
      { weeks: [1, 2, 3, 4], day: 0, session: offA1 },
      { weeks: [1, 2, 3, 4], day: 3, session: offB1 },
      { weeks: [5, 6, 7, 8], day: 0, session: offA2 },
      { weeks: [5, 6, 7, 8], day: 3, session: offB2 },
    ],
  },
  {
    name: "In-season maintenance (4 weeks, repeat)",
    tags: ["strength", "in-season", "4 weeks"],
    weeks: 4,
    description: "One short, heavy-but-crisp session a week to keep strength without fatigue. Apply it again for the next block.",
    notes: { "1": "One session, about 25 minutes" },
    schedule: [{ weeks: [1, 2, 3, 4], day: 2, session: maint }],
  },
  {
    name: "Injury resilience (6 weeks)",
    tags: ["strength", "resilience", "6 weeks"],
    weeks: 6,
    description: "Bands and bodyweight, twice a week: hips, calves, hamstrings and trunk, the usual weak links for runners and triathletes.",
    notes: { "1": "Slow and controlled", "4": "Add a set to anything that felt easy" },
    schedule: [
      { weeks: [1, 2, 3, 4, 5, 6], day: 1, session: resA },
      { weeks: [1, 2, 3, 4, 5, 6], day: 4, session: resB },
    ],
  },
];

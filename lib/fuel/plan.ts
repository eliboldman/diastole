// Session fueling and fuel days (Phase 9a). Rules, not AI: general sports-nutrition guidance
// scaled by how long and how hard each planned workout is. Never uses body weight.
// Pure module (type imports only) so it can be tested directly with `node`.

import type { Duration, Pool, Sport, Step, Target } from "../workouts/garmin-format.ts";

export type FuelMode = "full" | "plates" | "workout";
export const FUEL_MODES: Record<FuelMode, { label: string; help: string }> = {
  full: { label: "Full numbers", help: "Everything: meal logging with carbs, protein and fat, daily rings, grams and fluid amounts." },
  plates: { label: "Plate pictures", help: "Meal logging and rings without numbers, plus plate pictures and foods." },
  workout: { label: "Workout fueling only", help: "Only before, during and after guidance for workouts." },
};
export const DEFAULT_FUEL_MODE: FuelMode = "full";
export const asFuelMode = (v: unknown): FuelMode => (v === "full" || v === "plates" || v === "workout" ? v : DEFAULT_FUEL_MODE);

export type Zones = { threshold_speed_mps?: number | null; ftp_w?: number | null } | null;

export type Session = {
  sport: string;
  minutes: number | null; // null when the steps don't say (no steps, or only "until lap")
  hardMinutes: number;
  hard: boolean;
};

// ---------------------------------------------------------------- estimating a planned workout

const OPEN_STEP_SEC: Record<string, number> = { WARMUP: 600, COOLDOWN: 600 };
const DEFAULT_SPEED: Record<string, number> = { run: 2.9, bike: 7.5, swim: 0.9 }; // m/s, easy-ish incl. stops

function speedFor(sport: string, t: Target | undefined, zones: Zones, pool: Pool): number {
  if (t?.type === "pace_range") return 1000 / ((t.slowSecPerKm + t.fastSecPerKm) / 2);
  if (t?.type === "swim_pace") return ((pool?.unit === "YARD" ? 91.44 : 100) / t.secPer100) * 0.9; // a little for turns and rest
  if (sport === "run" && zones?.threshold_speed_mps) return Number(zones.threshold_speed_mps) * 0.82;
  return DEFAULT_SPEED[sport] ?? 2.9;
}

function isHard(intensity: string, t: Target | undefined, zones: Zones): boolean {
  if (t?.type === "hr_zone") return t.zone >= 4;
  if (t?.type === "swim_effort") return t.level >= 7;
  if (t?.type === "pace_range" && zones?.threshold_speed_mps) return t.fastSecPerKm <= (1000 / Number(zones.threshold_speed_mps)) * 1.04;
  if (t?.type === "power_range" && zones?.ftp_w) return t.high >= Number(zones.ftp_w) * 0.88;
  return intensity === "INTERVAL";
}

function stepSeconds(sport: string, intensity: string, d: Duration, t: Target | undefined, zones: Zones, pool: Pool): number {
  switch (d.type) {
    case "time":
    case "sendoff":
      return d.seconds;
    case "distance":
      return d.meters / speedFor(sport, t, zones, pool);
    case "open":
      return OPEN_STEP_SEC[intensity] ?? 0; // unknown length: count warm-ups and cool-downs only
  }
}

/** How long and how hard a planned workout is, from its steps. */
export function estimateSession(steps: Step[], sport: Sport | string, zones: Zones = null, pool: Pool = null): Session {
  let total = 0;
  let hard = 0;
  let known = false;
  const walk = (list: Step[], times: number) => {
    for (const s of list) {
      if (s.kind === "repeat") {
        walk(s.steps, times * s.times);
        continue;
      }
      if (s.duration.type !== "open") known = true;
      const sec = stepSeconds(sport, s.intensity, s.duration, s.target, zones, pool) * times;
      total += sec;
      if (isHard(s.intensity, s.target, zones)) hard += sec;
    }
  };
  walk(steps ?? [], 1);
  const minutes = known ? Math.round(total / 60) : null;
  const hardMinutes = Math.round(hard / 60);
  return { sport, minutes, hardMinutes, hard: hardMinutes >= 8 };
}

// ---------------------------------------------------------------- before / during / after

export type When = "before" | "during" | "after";
export type FuelLine = { when: When; plain: string; numbers: string };

/** Fueling for one session. `laterToday`: another session follows on the same day. */
export function sessionFueling(s: Session, opts: { laterToday?: boolean } = {}): FuelLine[] {
  const m = s.minutes ?? 45;
  const swim = s.sport === "swim";
  const big = s.hard || m >= 75;
  const lines: FuelLine[] = [];

  lines.push(
    big
      ? {
          when: "before",
          plain: "A carb-focused meal 2–3 hours before (rice, pasta, oats, bread, potatoes), or a banana or toast 30–60 minutes before if time is short. Go easy on fiber and fat.",
          numbers: "Meal with about 60–100 g carbs 2–3 h before, or 30–50 g carbs 30–60 min before. Lower fiber and fat.",
        }
      : {
          when: "before",
          plain: "No special prep. If you haven't eaten in 3 or more hours, have a small snack like a banana or toast.",
          numbers: "Optional small snack of about 15–30 g carbs, 30–60 min before.",
        },
  );

  if (m < 60) {
    lines.push({ when: "during", plain: swim ? "Water at the wall if you want it." : "Water if you want it. No fuel needed.", numbers: "Water to thirst. No carbs needed under an hour." });
  } else if (m < 75) {
    lines.push({
      when: "during",
      plain: `${swim ? "A bottle at the wall: water, or" : "Water, or"} a sports drink if it's hard or hot.`,
      numbers: "Water to thirst; optionally 15–30 g carbs (sports drink) if it's hard or hot.",
    });
  } else if (m < 150) {
    lines.push({
      when: "during",
      plain: swim
        ? "Keep a sports drink at the wall and sip between sets."
        : "Start fueling 30–45 minutes in: a gel, chews or half a banana every 30–40 minutes, and drink regularly.",
      numbers: "30–60 g carbs per hour from about 30–45 min in; 400–800 ml fluid per hour.",
    });
  } else {
    lines.push({
      when: "during",
      plain: "Fuel early and often: something every 20–30 minutes (gels, chews, sports drink), and drink with electrolytes, more when it's hot.",
      numbers: "60–90 g carbs per hour (glucose + fructose mixes if your gut is used to it); 400–800 ml fluid and 300–600 mg sodium per hour.",
    });
  }

  if (opts.laterToday) {
    lines.push({
      when: "after",
      plain: "You train again later today, so refuel soon: within 30–60 minutes have carbs and some protein, like a sandwich, yogurt and fruit, or chocolate milk.",
      numbers: "Within 30–60 min: 50–100 g carbs plus 20–30 g protein, then a normal meal before the next session.",
    });
  } else if (big || m >= 90) {
    lines.push({
      when: "after",
      plain: "Within an hour or two, a meal or snack with protein and carbs: yogurt with granola, a turkey sandwich, rice and eggs, or chocolate milk. Rehydrate too.",
      numbers: "Within 1–2 h: 20–30 g protein plus 50–100 g carbs; rehydrate.",
    });
  } else {
    lines.push({ when: "after", plain: "Your next normal meal covers it; include some protein.", numbers: "Your next regular meal, with about 20–30 g protein." });
  }
  return lines;
}

// ---------------------------------------------------------------- fuel days

export type FuelDay = "high" | "medium" | "low";
export type Plate = { carbs: number; protein: number; color: number }; // shares of the plate, sum 1

export const FUEL_DAYS: Record<FuelDay, { label: string; plate: Plate; plain: string; numbers: string }> = {
  high: {
    label: "High fuel day",
    plate: { carbs: 0.5, protein: 0.25, color: 0.25 },
    plain: "Half your plate carbs (rice, pasta, potatoes, bread), a quarter protein, a quarter fruit and veg. Snacks between meals help.",
    numbers: "Half the plate carbs, a quarter protein, a quarter fruit and veg, at each meal, plus carb snacks around training.",
  },
  medium: {
    label: "Medium fuel day",
    plate: { carbs: 0.35, protein: 0.3, color: 0.35 },
    plain: "About a third each: carbs, protein, and fruit and veg.",
    numbers: "About a third of the plate each: carbs, protein, fruit and veg; 20–30 g protein per meal.",
  },
  low: {
    label: "Low fuel day",
    plate: { carbs: 0.25, protein: 0.3, color: 0.45 },
    plain: "Lighter training today. Plenty of color and protein, carbs to appetite. Still eat enough: recovery days are when fitness is built.",
    numbers: "About half the plate fruit and veg, a third protein, the rest carbs; 20–30 g protein per meal.",
  },
};

/** The day's fuel level from its sessions (a race day is always high). */
export function fuelDay(sessions: Session[], race = false): FuelDay {
  if (race) return "high";
  const total = sessions.reduce((t, s) => t + (s.minutes ?? 45), 0);
  const anyHard = sessions.some((s) => s.hard);
  if (total >= 120 || (anyHard && total >= 75)) return "high";
  if (total >= 45 || anyHard) return "medium";
  return "low";
}

/** One line saying why, e.g. "2 sessions · about 1 h 45 min, including hard efforts". */
export function dayReason(sessions: Session[], race = false): string {
  if (race) return "Race day.";
  if (!sessions.length) return "No training planned.";
  const total = sessions.reduce((t, s) => t + (s.minutes ?? 45), 0);
  const t5 = Math.max(5, Math.round(total / 5) * 5);
  const h = Math.floor(t5 / 60);
  const mm = t5 % 60;
  const dur = h ? `${h} h${mm ? ` ${mm} min` : ""}` : `${mm} min`;
  const parts = [sessions.length > 1 ? `${sessions.length} sessions` : "1 session", `about ${dur}`];
  return `${parts.join(" · ")}${sessions.some((s) => s.hard) ? ", including hard efforts" : ""}.`;
}

/** A tip for today when tomorrow is a big day (long or hard), else null. */
export function eveTip(tomorrow: FuelDay, tomorrowSessions: Session[]): { plain: string; numbers: string } | null {
  if (tomorrow !== "high") return null;
  const long = tomorrowSessions.some((s) => (s.minutes ?? 0) >= 120);
  return long
    ? { plain: "Big session tomorrow: make tonight's dinner carb-rich (pasta, rice, potatoes).", numbers: "Big session tomorrow: carb-rich dinner tonight, and a carb snack before bed if you're hungry." }
    : { plain: "Hard day tomorrow: a normal dinner with a good portion of carbs sets you up.", numbers: "Hard day tomorrow: include a solid carb portion at dinner." };
}

export const FUEL_DISCLAIMER = "General fueling guidance for training, not medical or dietetic advice. Adjust to your appetite, and talk to your coach or a dietitian about anything specific.";

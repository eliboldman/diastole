// Phase 9d + 11: race fueling and race week. Rules from general sports-nutrition guidance, framed
// as training guidance, not medical or dietetic advice. Pure module so it can be tested with `node`.

export type RaceSport = "run" | "bike" | "swim" | "tri" | "other";
export type Race = { race_date: string; sport: RaceSport; distance_km: number | null; goal_seconds: number | null };

const DAY = 86_400_000;

/** Minutes the race will likely take: the goal time, else a typical pace for the distance. */
export function raceMinutes(r: Pick<Race, "sport" | "distance_km" | "goal_seconds">): number | null {
  if (r.goal_seconds && r.goal_seconds > 0) return Math.round(r.goal_seconds / 60);
  const km = Number(r.distance_km ?? 0);
  if (!(km > 0)) return null;
  switch (r.sport) {
    case "run":
      return Math.round(km * (km > 30 ? 6 : km > 15 ? 5.6 : 5.2)); // min/km slows with distance
    case "bike":
      return Math.round((km / (km > 120 ? 28 : 30)) * 60);
    case "swim":
      return Math.round(km * 20); // 2:00 per 100 m
    case "tri":
      if (km <= 30) return 80; // sprint
      if (km <= 60) return 150; // olympic
      if (km <= 120) return 330; // 70.3
      return 720; // full
    default:
      return null;
  }
}

/**
 * A typed goal time -> seconds. "1:45:00" is h:mm:ss and "45" is minutes. Two parts ("3:55") are
 * ambiguous: h:mm for a 70.3, m:ss for a 5K. Pick whichever is closer to a typical time for the
 * race's sport and distance; with no distance, single-digit hours read as h:mm.
 */
export function parseGoalTime(text: string, race?: Pick<Race, "sport" | "distance_km">): number | null {
  const t = text.trim();
  if (!t) return null;
  const parts = t.split(":").map((p) => (p === "" ? NaN : Number(p)));
  if (parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  let s: number;
  if (parts.length === 3) s = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 1) s = parts[0] * 60;
  else {
    const [a, b] = parts;
    if (b >= 60) return null;
    const asMinSec = a * 60 + b;
    const asHourMin = a * 3600 + b * 60;
    const typical = race ? raceMinutes({ sport: race.sport, distance_km: race.distance_km, goal_seconds: null }) : null;
    if (typical) {
      const off = (x: number) => Math.abs(Math.log(x / (typical * 60)));
      s = asHourMin <= 172_800 && off(asHourMin) < off(asMinSec) ? asHourMin : asMinSec;
    } else {
      s = a <= 9 ? asHourMin : asMinSec;
    }
  }
  return s >= 60 && s <= 172_800 ? Math.round(s) : null;
}

/** Days from today to race day in the athlete's calendar (0 = race day, negative = past). */
export function daysUntil(raceDate: string, today: string): number {
  return Math.round((Date.parse(`${raceDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY);
}

export const RACE_WEEK_DAYS = 10;

export type RacePlan = {
  minutes: number;
  carbsPerHour: number;
  fluidMlPerHour: number | null; // null: drink to thirst (short races)
  sodiumMgPerHour: number | null;
  carbLoad: { days: number; gPerKg: [number, number]; grams: [number, number] | null } | null;
  breakfast: { hoursBefore: number; gPerKg: [number, number]; grams: [number, number] | null };
  feeds: { minute: number; carbs: number; fluid: number | null }[];
  notes: string[];
};

const round = (n: number, to: number) => Math.round(n / to) * to;

/**
 * The race-day plan. Carbs per hour rise with duration, capped near what the athlete's gut has
 * practiced; fluid from their sweat-rate test (replace about 70%, never more than 800 ml/h).
 */
export function racePlan(o: { minutes: number; sport: RaceSport; weightKg: number | null; sweatRateMlH: number | null; gutMaxCarbs: number | null }): RacePlan {
  const { minutes, weightKg } = o;
  const notes: string[] = [];

  let carbs = minutes < 60 ? 0 : minutes <= 150 ? 60 : 90;
  if (minutes >= 45 && minutes < 75) carbs = 30;
  if (carbs > 30 && o.gutMaxCarbs != null) {
    const cap = Math.max(30, o.gutMaxCarbs + 10);
    if (cap < carbs) {
      carbs = round(cap, 5);
      notes.push(`Capped near what your gut has practiced (${o.gutMaxCarbs} g/h). Keep training it up toward ${minutes > 150 ? 90 : 60} g/h.`);
    }
  } else if (carbs > 60 && o.gutMaxCarbs == null) {
    carbs = 60;
    notes.push("Log a few gut-training sessions to raise this toward 90 g/h. Start at 60 g/h until then.");
  }

  const short = minutes < 60;
  let fluid: number | null = null;
  if (!short) {
    if (o.sweatRateMlH) fluid = Math.min(800, Math.max(300, round(o.sweatRateMlH * 0.7, 50)));
    else {
      fluid = 500;
      notes.push("Do a sweat-rate test so fluid can be sized to you. 500 ml/h is a middle-of-the-road start.");
    }
  }
  const sodium = short ? null : o.sweatRateMlH && o.sweatRateMlH > 1200 ? 700 : 500;

  const kg = (r: [number, number]): [number, number] | null => (weightKg ? [round(r[0] * weightKg, 10), round(r[1] * weightKg, 10)] : null);
  const carbLoad = minutes >= 90 ? { days: minutes >= 150 ? 2 : 1, gPerKg: [8, 10] as [number, number], grams: kg([8, 10]) } : null;
  const breakfast = { hoursBefore: 3, gPerKg: [1, 3] as [number, number], grams: kg([1, 3]) };

  // A feed every 20 minutes. A triathlon starts feeding on the bike (about 15% in, after the swim).
  const feeds: RacePlan["feeds"] = [];
  if (carbs > 0) {
    const start = o.sport === "tri" ? round(minutes * 0.15, 5) + 10 : 20;
    for (let m = start; m < minutes - 10; m += 20) feeds.push({ minute: m, carbs: Math.round(carbs / 3), fluid: fluid ? round(fluid / 3, 10) : null });
  }
  if (!weightKg) notes.push("Add your body weight on the Fuel page to see carb-load and breakfast grams.");
  if (short) notes.push("Under an hour: a normal breakfast and a sip of fluid if you're thirsty is plenty.");
  return { minutes, carbsPerHour: carbs, fluidMlPerHour: fluid, sodiumMgPerHour: sodium, carbLoad, breakfast, feeds, notes };
}

/** Sweat rate in ml/hour. Only this result is saved; the weights are never stored. */
export function sweatRate(o: { preKg: number; postKg: number; drankMl: number; peedMl?: number; minutes: number }): number | null {
  if (!(o.minutes >= 20 && o.preKg > 25 && o.postKg > 25)) return null;
  const lostMl = (o.preKg - o.postKg) * 1000 + Math.max(0, o.drankMl) - Math.max(0, o.peedMl ?? 0);
  const rate = (lostMl / o.minutes) * 60;
  return rate > 0 && rate < 4000 ? Math.round(rate) : null;
}

/** Highest carbs/hour the athlete has handled comfortably (comfort 4-5) in gut training. */
export function gutMax(sessions: { carbs_g_per_h: number; comfort: number }[]): number | null {
  const ok = sessions.filter((s) => s.comfort >= 4).map((s) => s.carbs_g_per_h);
  return ok.length ? Math.max(...ok) : null;
}

export type CheckItem = { key: string; label: string };
/** Race-week checklist for the days that remain (10 days out to race morning). */
export function raceWeekChecklist(days: number, plan: RacePlan | null): { title: string; items: CheckItem[] } {
  if (days >= 8)
    return {
      title: "Lock it in",
      items: [
        { key: "kit", label: "Race kit decided: nothing new on race day" },
        { key: "fuel_test", label: "Practice your race fuel in a key session" },
        { key: "logistics", label: "Travel, bib pickup and start time sorted" },
      ],
    };
  if (days >= 4)
    return {
      title: "Taper",
      items: [
        { key: "sleep", label: "Bank sleep: aim for 8+ hours" },
        { key: "taper", label: "Follow the taper. Feeling restless is normal" },
        { key: "course", label: "Study the course: hills, aid stations, turns" },
      ],
    };
  if (days >= 2)
    return {
      title: plan?.carbLoad ? "Carb load" : "Top up",
      items: [
        ...(plan?.carbLoad
          ? [{ key: "load", label: plan.carbLoad.grams ? `Carbs ${plan.carbLoad.grams[0]}–${plan.carbLoad.grams[1]} g a day (${plan.carbLoad.gPerKg[0]}–${plan.carbLoad.gPerKg[1]} g/kg)` : "Carbs 8–10 g per kg a day" }]
          : [{ key: "load", label: "Normal, carb-rich meals" }]),
        { key: "fluids", label: "Drink steadily; pale-yellow is the goal" },
        { key: "pack", label: "Pack: bib, chip, shoes, nutrition, gels, layers" },
      ],
    };
  if (days === 1)
    return {
      title: "Tomorrow's the day",
      items: [
        { key: "shakeout", label: "Short shakeout with a few strides" },
        { key: "layout", label: "Lay out everything tonight" },
        { key: "breakfast", label: "Breakfast planned and bought" },
        { key: "early", label: "Early night. One bad night's sleep won't hurt you" },
      ],
    };
  return {
    title: "Race morning",
    items: [
      { key: "bfast", label: plan?.breakfast.grams ? `Breakfast ${plan.breakfast.hoursBefore} h before: ${plan.breakfast.grams[0]}–${plan.breakfast.grams[1]} g carbs` : `Breakfast ${plan?.breakfast.hoursBefore ?? 3} h before, carb-rich and familiar` },
      { key: "warm", label: "Warm up as practiced" },
      { key: "fuel", label: plan && plan.carbsPerHour ? `Fuel ${plan.carbsPerHour} g carbs per hour, from the first feed` : "Enjoy it" },
    ],
  };
}

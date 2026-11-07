// The workout-step shape Claude writes (plain units: m:ss paces, % of FTP or watts, yards/meters/miles).
// lib/workouts/ai-steps.ts turns each leaf into a Diastole step. Shared by "Describe it" and "Suggest workouts".
import { z } from "zod";

export const AiLeaf = z.object({
  kind: z.literal("step"),
  intensity: z.enum(["WARMUP", "ACTIVE", "INTERVAL", "RECOVERY", "REST", "COOLDOWN", "MAIN"]),
  duration_type: z.enum(["time", "distance", "open", "sendoff"]).describe("open = until the lap button; sendoff = swim rest step that leaves on the clock"),
  seconds: z.number().nullable().describe("for time and sendoff"),
  distance: z.number().nullable().describe("for distance, in distance_unit"),
  distance_unit: z.enum(["m", "km", "yd", "mi"]).nullable(),
  target_type: z.enum(["none", "hr_zone", "hr_range", "pace_range", "power_pct_ftp", "power_watts", "swim_effort", "swim_pace"]),
  hr_zone: z.number().int().nullable().describe("1-5"),
  low: z.number().nullable().describe("bpm (hr_range), % of FTP (power_pct_ftp) or watts (power_watts)"),
  high: z.number().nullable(),
  pace_fast: z.string().nullable().describe("m:ss per pace_unit, the faster end"),
  pace_slow: z.string().nullable().describe("m:ss per pace_unit, the slower end"),
  swim_effort: z.number().int().nullable().describe("1-10: 1 recovery ... 10 all-out"),
  swim_pace_per_100: z.string().nullable().describe("m:ss per 100 of the pool's unit"),
  stroke: z.enum(["FREESTYLE", "BACKSTROKE", "BREASTSTROKE", "BUTTERFLY", "IM", "RIMO", "MIXED", "CHOICE"]).nullable(),
  drill: z.enum(["KICK", "PULL"]).nullable(),
  equipment: z.enum(["SWIM_FINS", "SWIM_KICKBOARD", "SWIM_PADDLES", "SWIM_PULL_BUOY", "SWIM_SNORKEL"]).nullable(),
  note: z.string().nullable().describe("short cue shown on the watch, optional"),
});
export const AiRepeat = z.object({ kind: z.literal("repeat"), times: z.number().int(), steps: z.array(AiLeaf) });

// Both whole outputs live here (not in the server files) so a test can check them against the API's
// schema limits: at most 16 nullable/union parameters (see schema-limits.ts). BuildOut is at 16.

/** "Describe it": one workout. */
export const BuildOut = z.object({
  title: z.string().describe("short, e.g. 6 × 800 m at 5K pace"),
  sport: z.enum(["run", "bike", "swim"]),
  description: z.string().nullable().describe("one or two sentences for the athlete, only if the coach gave context"),
  steps: z.array(z.discriminatedUnion("kind", [AiLeaf, AiRepeat])),
  assumptions: z.string().nullable().describe("anything you had to assume or couldn't represent, for the coach; null if none"),
});

/** "Suggest workouts": plan-level fields are required (empty or 0 = none) to stay under the limit. */
export const PlanWorkout = z.object({
  date: z.string().describe("YYYY-MM-DD, within the requested window"),
  sport: z.enum(["run", "bike", "swim"]),
  title: z.string().describe("workout name in the coach's tone, under 60 characters"),
  description: z.string().describe("top-level message for the athlete, in the coach's tone; one or two sentences; empty if none"),
  why: z.string().describe("one or two plain sentences for the athlete: what this session is for"),
  pool_length: z.number().describe("swims: pool length; 0 for runs and rides"),
  pool_unit: z.enum(["yd", "m"]).describe("swims: the pool's unit; ignored otherwise"),
  steps: z.array(z.discriminatedUnion("kind", [AiLeaf, AiRepeat])),
});
export const PlanOut = z.object({
  summary: z.string().describe("for the coach, 3-5 sentences: period and focus of this block, how the request's guidance and the athlete's data shaped it"),
  weeks: z.array(z.object({ week_start: z.string().describe("YYYY-MM-DD"), focus: z.string(), planned_hours: z.number().describe("0 if not estimated") })),
  workouts: z.array(PlanWorkout),
  other_days: z.array(z.object({ date: z.string(), kind: z.enum(["rest", "strength", "travel", "race", "note"]), note: z.string() })).describe("strength, rest, travel and race days (not watch workouts)"),
  assumptions: z.string().describe("anything assumed or missing (e.g. no current FTP), for the coach; empty if none"),
});
export const FixOut = z.object({ workouts: z.array(PlanWorkout) });

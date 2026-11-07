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

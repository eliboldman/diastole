// The coach's guide and per-athlete notes give the plan its structure; the numbers (FTP, paces,
// heart rates) come only from the app. This removes absolute physiological numbers from the text
// before it reaches the model, and keeps everything structural: rep counts, durations, distances,
// percentages of FTP or threshold, weekly skeletons. Pure, for tests.

const APP = "[from the app]";

export function redactAthleteNumbers(text: string): string {
  return (
    text
      // "FTP 250", "FTP: 250w", "LTHR 172 bpm", "max HR 190", "threshold pace 6:35/mi", "CP of 280"
      .replace(
        /\b(FTP|CP|LTHR|critical power|threshold(?:\s+(?:HR|heart rate|pace|power))?|max(?:imum)?\s*(?:HR|heart rate)|resting\s*(?:HR|heart rate)|VO2\s*max)(\s*(?:is|of|at|around|about|=|:|~|≈|-)?\s*)\d{1,3}(?::\d{2})?(?:\.\d+)?(?:\s*(?:w|watts|bpm|(?:min)?\s*\/\s*(?:mi|mile|km|k)|per\s+(?:mi|mile|km)))?\b/gi,
        (_m, label: string) => `${label} ${APP}`,
      )
      // Heart-rate zone ranges: "Z2 140-150", "Zone 3: 150–160"
      .replace(/\b(Z(?:one)?\s?[1-7])(\s*[:=(]?\s*)\d{2,3}\s?[-–]\s?\d{2,3}(\s?bpm)?\)?/gi, (_m, z: string) => `${z} ${APP}`)
      // Absolute paces: "7:15/mi", "4:05 per km", "1:40/100m", "6:30-6:45 min/mi"
      .replace(/\b\d{1,2}:\d{2}(?:\s?[-–]\s?\d{1,2}:\d{2})?\s?(?:min\s?)?(?:\/|per\s)\s?(?:mi|mile|km|k|100\s?(?:m|y|yd|yds))\b/gi, `pace ${APP}`)
      // Watts and bpm on their own: "250w", "220-240 W", "172 bpm"
      .replace(/\b\d{2,4}(?:\s?[-–]\s?\d{2,4})?\s?(?:w|watts)\b/gi, `watts ${APP}`)
      .replace(/\b\d{2,3}(?:\s?[-–]\s?\d{2,3})?\s?bpm\b/gi, `heart rate ${APP}`)
  );
}

/**
 * The weekly layout comes from the athlete's own Training days, so the guide's schedule is left
 * out: tables (the weekly skeleton) and day-by-day lines like "Monday: rest" or "- Tue - intervals".
 */
export function withoutWeeklySchedule(text: string): string {
  const DAY = /^\s*(?:[-*]\s*)?\**\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*\**\s*(?:[:–—-]|\()/i;
  return text
    .split("\n")
    .filter((l) => !l.trim().startsWith("|") && !DAY.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** What the planning model reads from the coach's document: structure only, no numbers, no fixed week. */
export const guideForAi = (text: string) => withoutWeeklySchedule(redactAthleteNumbers(text));

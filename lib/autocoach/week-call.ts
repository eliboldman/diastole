// Judging the next week from the last few, instead of shipping it as pre-built, and reading fatigue as a
// trend rather than a one-day verdict. Rules only. Pure module, testable with `node`.
//
//   weekCall:     Sunday review -> build as planned / hold (one hard day lighter) / recover (2-3 lighter days)
//   redTrend:     readiness red on 2+ of the last 3 days -> propose 2-3 lighter days, not a one-day swap
//   swapCandidates: which sessions a hold / recover / lighter-days proposal turns into their easy version

export type Call = "build" | "hold" | "recover";

export type WeekSignals = {
  /** Key sessions due and done over the last 3 weeks (this week included). */
  keyDue: number;
  keyDone: number;
  /** Readiness colours this week. */
  red: number;
  yellow: number;
  /** 7-day vs 28-day averages. Sleep in seconds. Null when there isn't enough data. */
  hrv7: number | null;
  hrv28: number | null;
  rhr7: number | null;
  rhr28: number | null;
  sleep7: number | null;
  sleep28: number | null;
  /** Acute:chronic load ratio from the readiness engine (1 = usual). */
  loadRatio: number | null;
  /** plan_meta.week_type of next week: build, test, recovery, taper, race, absorb. */
  nextWeekType: string | null;
};

export type WeekCall = { call: Call; reasons: string[]; asPlanned: boolean };

const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);

export function weekCall(s: WeekSignals): WeekCall {
  const hrvDown = s.hrv7 !== null && s.hrv28 ? s.hrv7 <= s.hrv28 * 0.93 : false;
  const rhrUp = s.rhr7 !== null && s.rhr28 ? s.rhr7 >= s.rhr28 + 3 : false;
  const sleepShort = s.sleep7 !== null && s.sleep28 ? s.sleep7 < s.sleep28 * 0.9 : false;
  const recover: string[] = [];
  const hold: string[] = [];

  // Rising resting HR + falling HRV on normal sleep is accumulated load, not one bad night.
  if (hrvDown && rhrUp && !sleepShort) recover.push(`HRV ${pct(s.hrv7!, s.hrv28!)}% and resting HR +${Math.round(s.rhr7! - s.rhr28!)} bpm vs your 4-week normal, on normal sleep`);
  else if (hrvDown && rhrUp) hold.push(`HRV down and resting HR up, but sleep was ${pct(s.sleep7!, s.sleep28!)}% short, so sleep may explain it`);
  else if (hrvDown) hold.push(`HRV ${pct(s.hrv7!, s.hrv28!)}% vs your 4-week normal`);
  else if (rhrUp) hold.push(`Resting HR +${Math.round(s.rhr7! - s.rhr28!)} bpm vs your 4-week normal`);

  if (s.red >= 3) recover.push(`${s.red} red readiness days this week`);
  else if (s.red === 2) hold.push("2 red readiness days this week");

  if (s.loadRatio !== null && s.loadRatio >= 1.5) hold.push(`Load ${Math.round(s.loadRatio * 100)}% of usual`);
  if (s.keyDue >= 3 && s.keyDone / s.keyDue < 0.67) hold.push(`${s.keyDone} of ${s.keyDue} key sessions done over 3 weeks: repeat the load rather than stack more on top`);

  const call: Call = recover.length ? "recover" : hold.length ? "hold" : "build";
  const reasons = [...recover, ...hold];
  // A week that's already lighter by design needs no change.
  const lighter = ["recovery", "taper", "race", "absorb"].includes(s.nextWeekType ?? "");
  if (lighter) return { call: "build", reasons: reasons.length ? [...reasons, `next week is already a ${s.nextWeekType} week`] : [], asPlanned: true };
  if (call === "build") return { call, reasons: ["key sessions done, recovery markers in your normal range"], asPlanned: true };
  return { call, reasons, asPlanned: false };
}

export const CALL_TEXT: Record<Call, string> = {
  build: "Build as planned",
  hold: "Hold: one hard day lighter",
  recover: "Recover: 2-3 lighter days",
};

/** Readiness red on at least 2 of the last 3 days (today included): a trend, not a single day. */
export function redTrend(lastThree: (string | null | undefined)[]): boolean {
  return lastThree.filter((c) => c === "red").length >= 2;
}

export type Candidate = { id: string; date: string; sport: string; key: boolean; category?: string | null; test?: boolean };

/**
 * Sessions to make easy, in date order.
 *   hold:    the first midweek key session (not a test, a long ride or a long run)
 *   recover: every key session in the first `days` days of the range that isn't a test (max 3)
 * Tests stay as they are: they're the checkpoints, and a tired test just says so.
 */
export function swapCandidates(sessions: Candidate[], mode: "hold" | "recover", from: string, days = 3): Candidate[] {
  const keys = sessions.filter((s) => s.key && !s.test && s.category !== "test" && ["run", "bike", "swim"].includes(s.sport)).sort((a, b) => a.date.localeCompare(b.date));
  if (mode === "hold") return keys.filter((s) => s.category !== "long_ride" && s.category !== "long_run").slice(0, 1);
  const end = new Date(Date.parse(`${from}T12:00:00Z`) + (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return keys.filter((s) => s.date >= from && s.date <= end).slice(0, 3);
}

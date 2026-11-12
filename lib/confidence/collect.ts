// Confidence bank rules: which moments become proof, and the "you're ready" summary. Pure (tested).
// Rules only, no AI: the summary is built from the athlete's own saved evidence.

export type Kind = "long" | "brick" | "pr" | "tough" | "praise" | "note" | "own";
export type Entry = { kind: Kind; ref: string; title: string; detail?: string | null; date: string; activity_id?: string | null };

export type Act = { id: string; sport: string | null; start_time: string; duration_s: number | null; name: string | null };
export type CollectInput = {
  tz: string;
  acts: Act[]; // oldest first
  checkins: { activity_id: string; rpe: number | null; feel: number | null; pain: Record<string, number> | null; note: string | null }[];
  readiness: Record<string, string>; // date -> overall flag
  achievements: { key: string; value: number | null; achieved_at: string; activity_id: string | null }[];
  praise: { id: string; body: string; created_at: string }[]; // coach messages to this athlete
  prLabel: Record<string, string>;
};

const fam = (s: string | null) => (/swim/i.test(s ?? "") ? "swim" : /run|treadmill|trail|track/i.test(s ?? "") ? "run" : /cycl|bik|ride|spin/i.test(s ?? "") ? "bike" : "other");
const WORD: Record<string, string> = { run: "run", bike: "ride", swim: "swim", other: "session" };
export const hm = (sec: number) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m} min`;
};
const day = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
const PRAISE = /\b(proud|great (job|work|session|run|ride|swim)|nailed|crushed|strong|amazing|awesome|impressive|well done|love(d)? (that|this|it)|so good|huge|beast)\b/i;
const LONG_MIN: Record<string, number> = { run: 75, bike: 150, swim: 50, other: 9999 };

export function collect(i: CollectInput): Entry[] {
  const out: Entry[] = [];
  const check = new Map(i.checkins.map((c) => [c.activity_id, c]));

  // Longest session per sport so far (over the window), when it's genuinely long.
  const best: Record<string, number> = {};
  for (const a of i.acts) {
    const f = fam(a.sport);
    const d = a.duration_s ?? 0;
    if (d >= LONG_MIN[f] * 60 && d > (best[f] ?? 0) * 1.02) out.push({ kind: "long", ref: a.id, title: `Longest ${WORD[f]} in months: ${hm(d)}`, detail: a.name, date: day(a.start_time, i.tz), activity_id: a.id });
    best[f] = Math.max(best[f] ?? 0, d);
  }

  // Bricks: a ride then a run starting within 30 minutes of the ride ending.
  for (let k = 0; k < i.acts.length - 1; k++) {
    const b = i.acts[k], r = i.acts[k + 1];
    if (fam(b.sport) !== "bike" || fam(r.sport) !== "run") continue;
    const gap = Date.parse(r.start_time) - (Date.parse(b.start_time) + (b.duration_s ?? 0) * 1000);
    if (gap < 0 || gap > 30 * 60_000) continue;
    const total = (b.duration_s ?? 0) + (r.duration_s ?? 0);
    if (total >= 75 * 60) out.push({ kind: "brick", ref: `${b.id}+${r.id}`, title: `Brick: ${hm(b.duration_s ?? 0)} ride, then a ${hm(r.duration_s ?? 0)} run`, date: day(b.start_time, i.tz), activity_id: r.id });
  }

  // Tough sessions finished on a low-readiness day (hard effort, no pain flagged).
  for (const a of i.acts) {
    const c = check.get(a.id);
    const flag = i.readiness[day(a.start_time, i.tz)];
    const hurting = Object.values(c?.pain ?? {}).some((v) => v >= 2);
    if ((flag === "red" || flag === "yellow") && (c?.rpe ?? 0) >= 7 && (a.duration_s ?? 0) >= 40 * 60 && !hurting)
      out.push({ kind: "tough", ref: a.id, title: `Got it done on a ${flag === "red" ? "rough" : "so-so"} readiness day`, detail: `${a.name || WORD[fam(a.sport)]}, ${hm(a.duration_s ?? 0)}, effort ${c!.rpe}/10`, date: day(a.start_time, i.tz), activity_id: a.id });
  }

  // PRs and threshold gains.
  for (const x of i.achievements) {
    const label = i.prLabel[x.key];
    if (!label || /consistency/.test(x.key)) continue;
    out.push({ kind: "pr", ref: `${x.key}:${x.achieved_at.slice(0, 10)}`, title: label, date: day(x.achieved_at, i.tz), activity_id: x.activity_id });
  }

  // Coach praise (their own words, quoted).
  for (const m of i.praise) {
    if (!PRAISE.test(m.body)) continue;
    out.push({ kind: "praise", ref: m.id, title: "Your coach said", detail: m.body.length > 240 ? `${m.body.slice(0, 237)}…` : m.body, date: day(m.created_at, i.tz) });
  }

  // Their own upbeat check-in notes.
  for (const a of i.acts) {
    const c = check.get(a.id);
    if (c?.note && (c.feel ?? 0) >= 4 && c.note.trim().length >= 8) out.push({ kind: "note", ref: a.id, title: "You wrote", detail: c.note.trim().slice(0, 300), date: day(a.start_time, i.tz), activity_id: a.id });
  }
  return out;
}

export type ReadyFor = { minutes: number | null; sport: string; title: string } | { race: string };

/** A short "you're ready" summary from saved evidence (newest first). Plain facts, the athlete's own. */
export function readySummary(entries: (Entry & { hidden?: boolean })[], forWhat: ReadyFor): string[] {
  const e = entries.filter((x) => !x.hidden);
  const lines: string[] = [];
  const longs = e.filter((x) => x.kind === "long");
  const bricks = e.filter((x) => x.kind === "brick");
  const tough = e.filter((x) => x.kind === "tough");
  const prs = e.filter((x) => x.kind === "pr");
  const praise = e.find((x) => x.kind === "praise");
  const own = e.find((x) => x.kind === "own" || x.kind === "note");
  if (longs.length) lines.push(longs.length === 1 ? `You've gone long before: ${longs[0].title.toLowerCase().replace(/^longest /, "your longest ")}.` : `You've stretched your longest sessions ${longs.length} times.`);
  if (bricks.length && "race" in forWhat) lines.push(`${bricks.length} brick${bricks.length === 1 ? "" : "s"} in the bank. Your legs know the switch.`);
  if (prs.length) lines.push(`${prs.length} PR${prs.length === 1 ? "" : "s"} and gains, including ${prs.slice(0, 2).map((p) => p.title.toLowerCase()).join(" and ")}.`);
  if (tough.length) lines.push(`${tough.length} time${tough.length === 1 ? "" : "s"} you finished a hard session on a day you didn't feel your best.`);
  if (praise?.detail) lines.push(`Your coach: "${praise.detail}"`);
  if (own?.detail) lines.push(`You: "${own.detail}"`);
  if (!lines.length) lines.push("Every session you've done is in your legs. Trust the work.");
  return lines.slice(0, 5);
}

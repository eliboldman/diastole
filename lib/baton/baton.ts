// Pod baton rules. Pure (tested in baton.test.ts); lib/baton/run.ts feeds it and saves the result.
//
// The holder passes the baton to the next opted-in member by finishing a workout (10+ min), timed to
// when the workout ended, so time zones don't matter. A rest day or "life happened" for the holder
// passes it on without touching the chain. After a day it nudges the pod (kindly); after two days
// it hops on by itself and the chain starts fresh. No one is ever blamed for a hop.

export type BatonState = { holder: string | null; since: string | null; handoffs: number; chain: number; longest: number; nudged_at: string | null };
export type BatonEvent = { kind: "start" | "pass" | "skip" | "hop"; from: string | null; to: string; at: string; activity?: string };
export type BatonCtx = {
  order: string[]; // opted-in active members, stable order
  finishes: Record<string, { at: string; activity: string }[]>; // workout end times per member, oldest first
  resting: Set<string>; // members on a rest day / life happened / sick today
  now: string;
};

export const NUDGE_H = 24;
export const HOP_H = 48;
export const HANDOFF_MILESTONES = [10, 25, 50, 100, 200, 365, 500, 1000];
export const CHAIN_MILESTONES = [7, 14, 30, 60, 100];
export const milestoneGrit = (kind: "handoffs" | "chain", n: number) => (kind === "chain" ? Math.min(60, 10 + Math.round(n / 2)) : Math.min(60, 10 + Math.round(n / 10)));

const hours = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3_600_000;

export function nextAfter(order: string[], id: string | null): string | null {
  if (!order.length) return null;
  const i = id ? order.indexOf(id) : -1;
  return order[(i + 1) % order.length] === id ? null : order[(i + 1) % order.length];
}

/** Advance the baton as far as the facts allow. Returns the new state and what happened. */
export function advance(state: BatonState, ctx: BatonCtx): { state: BatonState; events: BatonEvent[]; nudge: boolean } {
  const s = { ...state };
  const events: BatonEvent[] = [];
  if (ctx.order.length < 2) return { state: s, events, nudge: false };

  // No holder yet (or the holder opted out): hand it to the next member, chain intact.
  if (!s.holder || !ctx.order.includes(s.holder)) {
    const to = ctx.order[0];
    events.push({ kind: s.holder ? "skip" : "start", from: s.holder, to, at: ctx.now });
    s.holder = to;
    s.since = ctx.now;
  }

  const skipped = new Set<string>();
  for (let guard = 0; guard < 200; guard++) {
    const holder = s.holder!;
    const since = s.since ?? ctx.now;
    const f = (ctx.finishes[holder] ?? []).find((x) => x.at > since && x.at <= ctx.now);
    const next = nextAfter(ctx.order, holder);
    if (!next) break;
    if (f) {
      events.push({ kind: "pass", from: holder, to: next, at: f.at, activity: f.activity });
      s.holder = next;
      s.since = f.at;
      s.handoffs += 1;
      s.chain += 1;
      s.longest = Math.max(s.longest, s.chain);
      s.nudged_at = null;
      skipped.clear();
      continue;
    }
    if (ctx.resting.has(holder) && !skipped.has(holder)) {
      // Their turn pauses: the baton moves on, the chain doesn't break.
      skipped.add(holder);
      if (ctx.order.every((m) => ctx.resting.has(m))) break; // everyone resting: it waits
      events.push({ kind: "skip", from: holder, to: next, at: ctx.now });
      s.holder = next;
      s.since = ctx.now;
      continue;
    }
    if (hours(since, ctx.now) >= HOP_H) {
      events.push({ kind: "hop", from: holder, to: next, at: ctx.now });
      s.holder = next;
      s.since = ctx.now;
      s.chain = 0;
      s.nudged_at = null;
      continue;
    }
    break;
  }
  const nudge = Boolean(s.since && hours(s.since, ctx.now) >= NUDGE_H && (!s.nudged_at || s.nudged_at < s.since));
  if (nudge) s.nudged_at = ctx.now;
  return { state: s, events, nudge };
}

/** Milestones crossed between two states (pod-wide grit for each). */
export function milestonesCrossed(before: BatonState, after: BatonState): { kind: "handoffs" | "chain"; n: number }[] {
  const out: { kind: "handoffs" | "chain"; n: number }[] = [];
  for (const n of HANDOFF_MILESTONES) if (before.handoffs < n && after.handoffs >= n) out.push({ kind: "handoffs", n });
  // Chains are counted on the longest ever, so a chain milestone only pays once per pod.
  for (const n of CHAIN_MILESTONES) if (before.longest < n && after.longest >= n) out.push({ kind: "chain", n });
  return out;
}

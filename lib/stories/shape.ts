// What a pod's weekly episode may draw on, per member, respecting their pod sharing. Pure (tested).
// Never health (readiness, HRV, sleep, stress), weight, food, pain, bosses or grit balances.

export type MemberFacts = {
  first: string;
  shareLevel: number; // 0 name/avatar, 1 + readiness, 2 + training & performance
  sessions: { sport: string; minutes: number; name: string | null }[];
  prs: string[]; // labels of PRs set this week
  returnedAfterDays: number | null; // first session after a quiet stretch (training share only)
  campfireHighlight: string | null; // they posted it to the pod themselves
  batonPasses: number; // opted in to the baton
  propsReceived: number;
  topSticker: string | null; // a label, e.g. "Snail mode"
  challengeJoined: string[];
};

export type StoryMember = {
  name: string;
  training?: { sessions: number; hours: number; sports: string[]; longest_minutes: number; fun_workout_names: string[]; prs: string[]; back_after_quiet_days?: number };
  campfire_highlight?: string;
  baton_passes?: number;
  props_received?: number;
  most_received_sticker?: string;
  challenges?: string[];
};

const r1 = (x: number) => Math.round(x * 10) / 10;

export function shapeMember(m: MemberFacts): StoryMember | null {
  const out: StoryMember = { name: m.first };
  if (m.shareLevel >= 2 && m.sessions.length) {
    out.training = {
      sessions: m.sessions.length,
      hours: r1(m.sessions.reduce((s, x) => s + x.minutes, 0) / 60),
      sports: [...new Set(m.sessions.map((s) => s.sport))],
      longest_minutes: Math.max(...m.sessions.map((s) => s.minutes)),
      // Their own workout titles (what the pod already sees in the feed), only the playful-looking ones.
      fun_workout_names: m.sessions.map((s) => s.name ?? "").filter((n) => n && !/^(morning|afternoon|evening|lunch|night)?\s*(run|ride|swim|walk|cycling|running|swimming|workout)$/i.test(n.trim())).slice(0, 3),
      prs: m.prs.slice(0, 3),
    };
    if (m.returnedAfterDays && m.returnedAfterDays >= 7) out.training.back_after_quiet_days = m.returnedAfterDays;
  }
  if (m.campfireHighlight) out.campfire_highlight = m.campfireHighlight.slice(0, 280);
  if (m.batonPasses) out.baton_passes = m.batonPasses;
  if (m.propsReceived) out.props_received = m.propsReceived;
  if (m.topSticker) out.most_received_sticker = m.topSticker;
  if (m.challengeJoined.length) out.challenges = m.challengeJoined.slice(0, 3);
  return Object.keys(out).length > 1 ? out : null;
}

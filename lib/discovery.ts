// Spotlight tips (shown once, the first time a feature matters) and "What's new" (once per
// release, at most 3 highlights). Dismissed ids live in profiles.seen_tips. Pure.

export type Tip = { id: string; title: string; body: string };

export const TIPS = {
  lifeHappened: { id: "tip:life-happened", title: "Missed one? It happens.", body: "Tap “Life happened?” and say what's up. Small changes fix themselves; bigger ones go to your coach." },
  recovery: { id: "tip:recovery", title: "Recovery, with your coach's demos", body: "Follow along with a timer and spoken cues. It counts toward your week." },
  gear: { id: "tip:gear", title: "Keep your shoe miles right", body: "One tap tells Diastole which pair (or bike) you used, so you know when they're worn." },
  changeOfPlans: { id: "tip:change-of-plans", title: "Plans changed? Just say it.", body: "Type something like “easy long run instead of the bike today” and approve the swap in one tap." },
  myWorkouts: { id: "tip:my-workouts", title: "Build your own sessions", body: "Make workouts or import a set, then ask your coach to add one to your calendar." },
  campfire: { id: "tip:campfire", title: "Sunday campfire", body: "Every Sunday evening the pod gathers here. Add one highlight and one struggle from your week, in words, a voice note or a photo. It closes Monday morning." },
  baton: { id: "tip:baton", title: "Pass the baton", body: "Opt in and an invisible baton travels around the pod: each workout you finish hands it to the next person. Rest days pass it on without breaking the chain." },
  quests: { id: "tip:quests", title: "Rest day, with a few side quests", body: "Small, optional ways to recover: a walk, an early night, time with friends. Each earns grit. Skip them and nothing happens." },
  grit: { id: "tip:grit", title: "You've been earning grit", body: "Sessions, check-ins and smart rest days earn grit, and a planned session on a rough-readiness day earns extra. Spend it on stickers, avatar gear and themes. It can't be bought and never changes your training." },
  bedtime: { id: "tip:bedtime", title: "A bedtime that fits tomorrow", body: "Today works back from your next session to the time you'd want lights out. In the iPhone app you can get a gentle nudge or two in the evening; turn them off anytime in My setup." },
  predictions: { id: "tip:predictions", title: "What your training says you could run", body: "Estimates come from your recent best efforts, threshold pace, FTP and CSS, and move as you get fitter. Hide them anytime." },
  course: { id: "tip:course", title: "Know the course before race day", body: "Add the GPX and Diastole shows the hills, a time for this course, a pacing plan you can edit, and sessions that rehearse it." },
  strength: { id: "tip:strength", title: "Follow along, set by set", body: "Start session walks you through each exercise with a demo and a rest timer. Log what you actually did; your coach uses it to set next time's weights." },
  plans: { id: "tip:plans", title: "Save a block once, reuse it for anyone", body: "On an athlete's page, Save as plan turns their weeks into a template. Apply it to anyone with a race date: targets fit their zones and days fit their week." },
} satisfies Record<string, Tip>;

export type Release = { id: string; athlete: Highlight[]; coach: Highlight[] };
export type Highlight = { emoji: string; title: string; body: string; href?: string };

/** Newest first. Only the newest release shows, and only until it's dismissed. */
export const RELEASES: Release[] = [
  {
    id: "new:2026-11c",
    athlete: [
      { emoji: "🧭", title: "Me is a simple menu now", body: "Body & recovery, running form, your numbers, gear, connections and settings: one row each.", href: "/account" },
      { emoji: "☀️", title: "A calmer Today", body: "Your workout first, then readiness, fuel and check-in. Customize brings anything back.", href: "/me" },
      { emoji: "🚴", title: "Zwift & Rouvy", body: "Your coach's bike workouts on your trainer. Set it up in Me › Connections.", href: "/me/intervals" },
    ],
    coach: [
      { emoji: "🧭", title: "Me is a simple menu now", body: "Your own day, training and fuel sit at the top; settings and connections have one home.", href: "/account" },
      { emoji: "🚴", title: "Zwift & Rouvy", body: "Bike workouts reach athletes' trainers through intervals.icu, always as power.", href: "/me/intervals" },
      { emoji: "📺", title: "Ride screen and Apple TV", body: "Trainer-controlled rides from the iPhone, iPad and Apple TV apps (rolling out).", href: "/me/devices" },
    ],
  },
  {
    id: "new:2026-11b",
    athlete: [
      { emoji: "🌿", title: "Recovery routines", body: "Rolling, stretching and breathing with your coach's demos.", href: "/recovery" },
      { emoji: "🤷", title: "Life happened?", body: "Short on time or feeling off? Your plan adjusts.", href: "/me" },
      { emoji: "🔨", title: "Build your own workouts", body: "Make or import sessions and ask your coach to add them.", href: "/training/mine" },
    ],
    coach: [
      { emoji: "🔀", title: "Change of plans", body: "Say what's changing in a sentence; approve in one tap.", href: "/dashboard" },
      { emoji: "🌿", title: "Recovery library", body: "Build routines from your demos and assign them like workouts.", href: "/lab/recovery" },
      { emoji: "📥", title: "Requests and plan changes", body: "Athletes' requests and life-happened swaps land on Today.", href: "/dashboard" },
    ],
  },
];

export const latestRelease = () => RELEASES[0] ?? null;
export const seen = (list: string[] | null | undefined, id: string) => (list ?? []).includes(id);

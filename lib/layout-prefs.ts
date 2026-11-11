// Which sections each person shows on Today and Me, and in what order. Pure (testable with node).
// Stored on profiles.layout as { today?: { order, hidden }, me?: { order, hidden } }.

export const LAYOUT_PAGES = {
  // Today answers "what do I do today": the workout first, then how you're doing and what to eat.
  // Weekly tallies, streaks and history start hidden (Customize brings them back).
  today: [
    { key: "race", label: "Race week" },
    { key: "upcoming", label: "Today and coming up" },
    { key: "readiness", label: "Readiness" },
    { key: "bedtime", label: "Tonight's bedtime" },
    { key: "fuel", label: "Today's fuel" },
    { key: "checkin", label: "Check-in prompt" },
    { key: "recovery", label: "Recovery" },
    { key: "gear", label: "Which shoes?" },
    { key: "progress", label: "Weekly progress", hidden: true },
    { key: "streaks", label: "Streaks", hidden: true },
    { key: "recent", label: "Recent workouts", hidden: true },
    { key: "pods", label: "My pods", hidden: true },
  ],
  me: [
    { key: "setup", label: "My setup (closet, numbers, days)" },
    { key: "readiness", label: "Readiness" },
    { key: "trends", label: "Last 14 days" },
    { key: "form", label: "Running form" },
    { key: "notes", label: "Form notes" },
    { key: "goals", label: "Goal race and block" },
    { key: "metrics", label: "Metric cards" },
    { key: "prs", label: "Recent PRs" },
    { key: "story", label: "Season story" },
    { key: "secrets", label: "Secrets" },
  ],
} as const satisfies Record<string, readonly { key: string; label: string; hidden?: boolean }[]>;

export type LayoutPage = keyof typeof LAYOUT_PAGES;
export type PageLayout = { order: string[]; hidden: string[] };

export function isLayoutPage(p: unknown): p is LayoutPage {
  return typeof p === "string" && p in LAYOUT_PAGES;
}

/**
 * Clean a stored layout against the page's known sections: unknown keys dropped, sections added in a
 * later release appear in their default spot, everything else keeps the person's order.
 */
export function resolveLayout(page: LayoutPage, stored: unknown): PageLayout {
  const keys: string[] = LAYOUT_PAGES[page].map((s) => s.key);
  const raw = (stored && typeof stored === "object" ? (stored as Record<string, unknown>)[page] : null) as Partial<PageLayout> | null;
  const savedOrder = Array.isArray(raw?.order) ? raw.order.filter((k): k is string => typeof k === "string" && keys.includes(k)) : [];
  const order = [...new Set(savedOrder)];
  keys.forEach((k, i) => {
    if (order.includes(k)) return;
    // Insert a new section after the nearest earlier default neighbour the person still has.
    const before = keys.slice(0, i).reverse().find((b) => order.includes(b));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, k);
  });
  // Nothing saved yet: the page's defaults, including sections that start hidden.
  const defaults = (LAYOUT_PAGES[page] as readonly { key: string; hidden?: boolean }[]).filter((s) => s.hidden).map((s) => s.key);
  const hidden = Array.isArray(raw?.hidden) ? [...new Set(raw.hidden.filter((k): k is string => typeof k === "string" && keys.includes(k)))] : defaults;
  return { order, hidden };
}

/** Visible section keys in display order. */
export function visibleSections(layout: PageLayout): string[] {
  return layout.order.filter((k) => !layout.hidden.includes(k));
}

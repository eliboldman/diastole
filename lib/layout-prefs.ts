// Which sections each person shows on Today and Me, and in what order. Pure (testable with node).
// Stored on profiles.layout as { today?: { order, hidden }, me?: { order, hidden } }.

export const LAYOUT_PAGES = {
  today: [
    { key: "race", label: "Race week" },
    { key: "progress", label: "Weekly progress" },
    { key: "streaks", label: "Streaks" },
    { key: "checkin", label: "Check-in prompt" },
    { key: "gear", label: "Which shoes?" },
    { key: "readiness", label: "Readiness" },
    { key: "fuel", label: "Today's fuel" },
    { key: "upcoming", label: "Coming up" },
    { key: "recent", label: "Recent workouts" },
    { key: "pods", label: "My pods" },
  ],
  me: [
    { key: "readiness", label: "Readiness" },
    { key: "trends", label: "Last 14 days" },
    { key: "form", label: "Running form" },
    { key: "notes", label: "Form notes" },
    { key: "goals", label: "Goal race and block" },
    { key: "numbers", label: "My numbers" },
    { key: "closet", label: "My closet" },
    { key: "metrics", label: "Metric cards" },
    { key: "prs", label: "Recent PRs" },
    { key: "story", label: "Season story" },
  ],
} as const;

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
  const hidden = Array.isArray(raw?.hidden) ? [...new Set(raw.hidden.filter((k): k is string => typeof k === "string" && keys.includes(k)))] : [];
  return { order, hidden };
}

/** Visible section keys in display order. */
export function visibleSections(layout: PageLayout): string[] {
  return layout.order.filter((k) => !layout.hidden.includes(k));
}

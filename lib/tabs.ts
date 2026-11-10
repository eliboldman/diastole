// The bottom tab bar on phones: each person picks 3-5 places and their order (Settings → Bottom
// tabs). Saved on the account (profiles.tab_bar) and in a cookie so pages draw the right tabs at
// once. Pure; icons are matched by id in the Sidebar.

export type TabRole = "coach" | "athlete";
export type TabDef = { id: string; label: string; href: string; match?: string };

// match: other paths that light the tab up (a RegExp source).
export const TAB_OPTIONS: Record<TabRole, TabDef[]> = {
  athlete: [
    { id: "me", label: "Me", href: "/me", match: "^/me$|^/me/(story|setup)|^/(account|connect|races)(/|$)" },
    { id: "pods", label: "Pods", href: "/me/pods" },
    { id: "training", label: "Training", href: "/training", match: "^/(calendar|activity)(/|$)" },
    { id: "fuel", label: "Fuel", href: "/fuel" },
    { id: "messages", label: "Messages", href: "/messages" },
    { id: "calendar", label: "Calendar", href: "/calendar" },
    { id: "recovery", label: "Recovery", href: "/recovery" },
    { id: "races", label: "Races", href: "/races" },
    { id: "setup", label: "My setup", href: "/me/setup" },
    { id: "profile", label: "Profile", href: "/account" },
  ],
  coach: [
    { id: "today", label: "Today", href: "/dashboard", match: "^/digest(/|$)" },
    { id: "athletes", label: "Athletes", href: "/athletes", match: "^/(athlete|pods)(/|$)|^/activity/" },
    { id: "lab", label: "Lab", href: "/endurance-lab", match: "^/(library|workouts|lab)(/|$)" },
    { id: "messages", label: "Messages", href: "/messages" },
    { id: "calendar", label: "Calendar", href: "/calendar" },
    { id: "workouts", label: "Workouts", href: "/workouts" },
    { id: "library", label: "Library", href: "/library" },
    { id: "pods", label: "Pods", href: "/pods" },
    { id: "myday", label: "My day", href: "/me" },
    { id: "fuel", label: "Fuel", href: "/fuel" },
    { id: "training", label: "My training", href: "/training", match: "^/training(/|$)" },
    { id: "recovery", label: "Recovery", href: "/recovery" },
    { id: "races", label: "Races", href: "/races" },
    { id: "profile", label: "Me", href: "/account" },
  ],
};

export const DEFAULT_TABS: Record<TabRole, string[]> = { athlete: ["me", "pods", "training", "fuel"], coach: ["today", "athletes", "lab", "messages"] };
export const TABS_COOKIE = "d_tabs";
export const MIN_TABS = 3;
export const MAX_TABS = 5;

/** Valid tab ids for a role, in order, 3-5 of them; anything else falls back to the defaults. */
export function cleanTabs(raw: unknown, role: TabRole): string[] {
  const known = new Set(TAB_OPTIONS[role].map((t) => t.id));
  const list = Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === "string" && known.has(x)))].slice(0, MAX_TABS) : [];
  return list.length >= MIN_TABS ? list : DEFAULT_TABS[role];
}

/** The cookie holds both roles' choices: {"athlete": [...], "coach": [...]}. */
export function tabsFromCookie(value: string | undefined, role: TabRole): string[] {
  try {
    return cleanTabs(JSON.parse(decodeURIComponent(value ?? ""))?.[role], role);
  } catch {
    return DEFAULT_TABS[role];
  }
}
export const tabsCookie = (all: Partial<Record<TabRole, string[]>>) => encodeURIComponent(JSON.stringify(all));

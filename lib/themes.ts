// Color themes (Phase 13). The accent palette is swapped in globals.css by html[data-theme].
// Readiness colors (ready/caution/recover) never change with the theme.
export const THEMES = [
  { id: "diastole", label: "Diastole", swatch: "#6ee7b7" },
  { id: "ocean", label: "Ocean", swatch: "#7dd3fc" },
  { id: "violet", label: "Violet", swatch: "#c4b5fd" },
  { id: "mono", label: "Mono", swatch: "#e4e4e7" },
  { id: "blocks", label: "Blocks", swatch: "#8fd95a", hidden: true },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export const THEME_COOKIE = "d_theme";
export const asTheme = (v: unknown): ThemeId => (THEMES.some((t) => t.id === v) ? (v as ThemeId) : "diastole");

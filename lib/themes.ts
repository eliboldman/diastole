// Color themes (Phase 13). The accent palette is swapped in globals.css by html[data-theme].
// Readiness colors (ready/caution/recover) never change with the theme.
export const THEMES = [
  { id: "diastole", label: "Diastole", swatch: "#6ee7b7" },
  { id: "ocean", label: "Ocean", swatch: "#7dd3fc" },
  { id: "violet", label: "Violet", swatch: "#c4b5fd" },
  { id: "mono", label: "Mono", swatch: "#e4e4e7" },
  { id: "sunset", label: "Sunset", swatch: "#fdba74" },
  { id: "rose", label: "Rose", swatch: "#f9a8d4" },
  { id: "gold", label: "Gold", swatch: "#fcd34d" },
  { id: "custom", label: "Custom", swatch: "conic-gradient(from 0deg, #fca5a5, #fde68a, #86efac, #7dd3fc, #c4b5fd, #f9a8d4, #fca5a5)" },
  { id: "blocks", label: "Blocks", swatch: "#8fd95a", hidden: true },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export const THEME_COOKIE = "d_theme";
export const asTheme = (v: unknown): ThemeId => (THEMES.some((t) => t.id === v) ? (v as ThemeId) : "diastole");

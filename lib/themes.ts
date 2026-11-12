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
  // Grit store themes: listed once owned.
  { id: "lagoon", label: "Lagoon", swatch: "#5eead4", store: true },
  { id: "ember", label: "Ember", swatch: "#fb923c", store: true },
  { id: "aurora", label: "Aurora", swatch: "linear-gradient(135deg, #6ee7b7, #a78bfa)", store: true },
  { id: "blocks", label: "Blocks", swatch: "#8fd95a", hidden: true },
  // A tribute: sun gold over the Aegean. Found by typing "icarus" into search.
  { id: "icarus", label: "Icarus", swatch: "radial-gradient(circle at 50% 35%, #ffd27a 0 30%, #e8913a 45%, #10375c 75%)", hidden: true },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export const THEME_COOKIE = "d_theme";
export const asTheme = (v: unknown): ThemeId => (THEMES.some((t) => t.id === v) ? (v as ThemeId) : "diastole");

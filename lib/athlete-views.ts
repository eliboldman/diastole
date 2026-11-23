/** Views on the coach's athlete page (`/athlete/<id>?view=…`). Overview is the default. */
export type AthleteView = "overview" | "plan" | "zones" | "fuel";

export const ATHLETE_VIEWS: { v: AthleteView; label: string }[] = [
  { v: "overview", label: "Overview" },
  { v: "plan", label: "Plan" },
  { v: "zones", label: "Zones & gear" },
  { v: "fuel", label: "Races & fuel" },
];

/** Which view each section anchor lives in, so `/athlete/<id>#zones` style links still land. */
export const SECTION_VIEW = {
  week: "overview", checkins: "overview", safety: "overview", bedtime: "overview", recent: "overview",
  workouts: "plan", form: "plan", planning: "plan", strength: "plan", mobility: "plan", boss: "plan",
  zones: "zones", closet: "zones", swim: "zones", predictions: "zones",
  races: "fuel", fuel: "fuel",
} as const satisfies Record<string, AthleteView>;

export type AthleteSection = keyof typeof SECTION_VIEW;

export function parseAthleteView(v: string | undefined): AthleteView {
  return ATHLETE_VIEWS.some((x) => x.v === v) ? (v as AthleteView) : "overview";
}

/** Link straight to a section of an athlete's page, in the view that has it. */
export function athleteSection(id: string, section: AthleteSection, query = "") {
  const view: AthleteView = SECTION_VIEW[section];
  const q = new URLSearchParams(query);
  if (view !== "overview") q.set("view", view);
  return `/athlete/${id}${q.size ? `?${q}` : ""}#${section}`;
}

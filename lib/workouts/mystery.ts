// Mystery workouts: what a sealed workout shows. Pure.
export type MysteryFields = { mystery?: boolean | null; revealed_at?: string | null; title: string; sport?: string | null };

/** Still sealed for the athlete: a mystery, not revealed early, not done yet. */
export const sealed = (w: MysteryFields, done = false) => Boolean(w.mystery) && !w.revealed_at && !done;

const SPORT_WORD: Record<string, string> = { run: "run", bike: "ride", swim: "swim", strength: "strength session" };
/** The title an athlete sees while it's sealed. */
export const sealedTitle = (w: MysteryFields) => `Mystery ${SPORT_WORD[w.sport ?? ""] ?? "workout"}`;
export const titleFor = (w: MysteryFields, done = false) => (sealed(w, done) ? sealedTitle(w) : w.title);

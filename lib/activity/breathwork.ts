// Breathwork and meditation activities (Diastole Breathe records each session as a Garmin
// "Breathwork" activity, and Garmin's own breathing apps do too). They aren't training: no load,
// check-in, streak or planned-workout match. The session itself is saved as a breath session.
export const isBreathwork = (sport: string | null | undefined, name?: string | null) =>
  (!!sport && /breath|meditat|mindful/i.test(sport)) || (!!name && /^breathwork\b/i.test(name));

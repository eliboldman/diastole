// Push sounds (original Diastole sounds bundled in the iPhone app as .caf, previews on the web as .m4a).
// Pure module so both the settings page and the server use the same list.

export type SoundId = "quack" | "walker" | "heartbeat" | "chime" | "pop" | "tone" | "tick" | "default" | "none";
// "coach" isn't a notification group: it's the sound for anything the athlete's own coach sends.
export type PushGroup = "coach" | "messages" | "comments" | "props" | "workouts" | "pods" | "coaching" | "sleep" | "fuel";

export const SOUNDS: { id: SoundId; label: string }[] = [
  { id: "quack", label: "Duck quack" },
  { id: "walker", label: "Walker" },
  { id: "heartbeat", label: "Heartbeat" },
  { id: "chime", label: "Chime" },
  { id: "pop", label: "Pop" },
  { id: "tone", label: "Tone" },
  { id: "tick", label: "Tick" },
  { id: "default", label: "iPhone sound" },
  { id: "none", label: "Silent" },
];

export const DEFAULT_SOUND: Record<PushGroup, SoundId> = {
  coach: "quack",
  messages: "heartbeat",
  comments: "pop",
  props: "pop",
  workouts: "chime",
  pods: "tick",
  coaching: "tone",
  sleep: "chime",
  fuel: "pop",
};

const IDS = new Set(SOUNDS.map((s) => s.id));
export const asSound = (v: unknown, group: PushGroup): SoundId => (typeof v === "string" && IDS.has(v as SoundId) ? (v as SoundId) : DEFAULT_SOUND[group]);

/** Same grouping as the database's private.notify_group (kept in step by hand). */
export function groupOf(kind: string, meta: Record<string, unknown> | null): PushGroup | null {
  if (kind === "pod_props") return meta?.comment === true ? "comments" : "props";
  if (kind === "message") return "messages";
  if (kind === "pod_invite" || kind === "pod_answer" || kind === "pod_challenge") return "pods";
  if (["ai_suggestion", "form_insight", "athlete_joined", "checkin_pain", "briefs_ready", "safety_note", "zones_updated", "weekly_digest", "monthly_digest", "workout_request", "plan_change", "zone_suggestion", "session_missed", "boss_suggested", "device_stale_coach", "autocoach"].includes(kind)) return "coaching";
  if (kind === "bedtime_recap") return "sleep";
  if (kind === "refuel" || kind === "refuel_staff" || kind === "weight_goal") return "fuel";
  if (kind.startsWith("workout_")) return "workouts";
  return null;
}

/** The APNs "sound" value: a bundled file, iOS's default, or nothing (silent). */
export function apnsSound(id: SoundId): string | undefined {
  if (id === "none") return undefined;
  if (id === "default") return "default";
  return `${id}.caf`;
}

/** Which sound setting applies: "From your coach" wins when the sender is the recipient's coach. */
export function soundGroup(kind: string, meta: Record<string, unknown> | null, fromOwnCoach: boolean): PushGroup | null {
  return fromOwnCoach ? "coach" : groupOf(kind, meta);
}

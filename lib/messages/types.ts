// Shapes for Phase 4 messaging (see migration 20261119_messages).

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  media_kind: "photo" | "voice" | null;
  media_path: string | null;
  media_meta: { w?: number; h?: number; seconds?: number; mime?: string };
  activity_id: string | null;
  planned_workout_id: string | null;
  deleted_at: string | null;
  created_at: string;
};

export const MESSAGE_COLUMNS =
  "id, conversation_id, sender_id, body, media_kind, media_path, media_meta, activity_id, planned_workout_id, deleted_at, created_at";

export type Person = { id: string; name: string; role: "coach" | "athlete"; is_me: boolean };

export type ConversationInfo = {
  id: string;
  kind: "direct" | "pod";
  pod_id: string | null;
  title: string;
  other_id: string | null;
  people: Person[];
  reads: Record<string, string>;
};

export type InboxRow = {
  id: string;
  kind: "direct" | "pod";
  pod_id: string | null;
  title: string;
  other_id: string | null;
  last_message_at: string | null;
  last: { body: string | null; media_kind: "photo" | "voice" | null; deleted: boolean; from_me: boolean; sender: string } | null;
  unread: number;
};

/** A linked workout, resolved for the chip in a message. */
export type WorkoutRef = { kind: "activity" | "planned"; id: string; title: string; sport: string | null; date: string };

export const BODY_MAX = 2000;
export const VOICE_MAX_S = 60;
export const PAGE = 40;

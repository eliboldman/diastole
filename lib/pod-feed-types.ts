// Shapes returned by get_pod_activity_feed (see migration 20261117_activity_props).
import type { PoolUnit } from "@/lib/workouts/garmin-format";

export const FEED_PAGE = 15;

export type FeedProp = { sticker: string; total: number; senders: number; from_me: boolean; hidden: boolean };
export type FeedComment = { id: string; sticker: string; note: string; hidden: boolean; created_at: string; from_me: boolean; to_me: boolean; from_name: string };

export type FeedItem = {
  id: string;
  athlete_id: string;
  athlete_name: string;
  is_me: boolean;
  can_rename: boolean;
  sport: string | null;
  name: string | null;
  start_time: string;
  local_hour: number | null;
  duration_s: number | null;
  distance_m: number | null;
  avg_speed_mps: number | null;
  avg_hr: number | null;
  avg_power: number | null;
  elevation_gain_m: number | null;
  training_load: number | null;
  details: boolean;
  route: [number, number][] | null;
  pool_unit: PoolUnit | null;
  prs: { key: string; value: number | null }[]; // personal records set in this workout
  props: FeedProp[];
  comment_count: number;
  comments: FeedComment[]; // sticker notes + comments, oldest first (latest 30)
};

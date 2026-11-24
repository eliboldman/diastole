import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { breathData } from "@/lib/breath/data";
import { suggest, type Kind } from "@/lib/breath/plan";
import { localAt } from "@/lib/breath/save";

// What the Garmin watch needs for breathing: the athlete's pace and today's suggestion. Short keys
// because it rides along in the widget's background payload (~8 KB cap).
export type WatchBreath = { k: Kind; m: number; y: string; p: number };

export async function watchBreath(client: SupabaseClient, athleteId: string, tz: string): Promise<WatchBreath> {
  const today = localAt(tz).date;
  const d = await breathData(client, athleteId, today, tz);
  const tip = suggest(d.context);
  return { k: tip.kind, m: tip.minutes, y: tip.why.slice(0, 90), p: d.effectivePace };
}

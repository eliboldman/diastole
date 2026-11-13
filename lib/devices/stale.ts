// A watch that has gone quiet: 48 h+ without data (or never, 48 h after connecting). Pure.
export type Conn = { source: string; connected_at: string; last_synced_at: string | null };
export const STALE_MS = 48 * 3_600_000;

export function staleDevice(conns: Conn[] | null | undefined, now: number): { source: "garmin" | "apple"; days: number; never: boolean } | null {
  for (const c of conns ?? []) {
    if (c.source !== "garmin" && c.source !== "apple") continue;
    const heard = Date.parse(c.last_synced_at ?? c.connected_at);
    if (now - heard > STALE_MS) return { source: c.source, days: Math.max(2, Math.floor((now - heard) / 86_400_000)), never: !c.last_synced_at };
  }
  return null;
}

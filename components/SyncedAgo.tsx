"use client";

import { useEffect, useState } from "react";

const FRESH_MINUTES = 120;

function ago(mins: number) {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

/**
 * "synced 12 min ago" that keeps itself current, with a rippling dot while the data is fresh
 * (synced within the last two hours).
 */
export default function SyncedAgo({ at, prefix = "synced" }: { at: string | null; prefix?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (!at) return <span>{prefix} never</span>;
  // Server render and first paint use the timestamp only, so markup matches; the live value fills in after mount.
  const mins = now === null ? null : Math.max(0, Math.round((now - new Date(at).getTime()) / 60000));
  const fresh = mins !== null && mins <= FRESH_MINUTES;

  return (
    <span className="inline-flex items-center gap-1.5" title={new Date(at).toLocaleString()}>
      {fresh && <span className="live-dot" aria-hidden />}
      <span>
        {prefix} {mins === null ? "…" : ago(mins)}
      </span>
      {fresh && <span className="sr-only">(fresh data)</span>}
    </span>
  );
}

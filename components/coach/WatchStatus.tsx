import { AlertTriangle, Watch } from "lucide-react";
import Link from "next/link";

import SyncedAgo from "@/components/SyncedAgo";
import type { WatchStatus } from "@/lib/devices/status";

export type WatchRow = { id: string; name: string; status: WatchStatus };

const deviceName = (d: WatchStatus["device"]) => (d === "garmin" ? "Garmin" : d === "apple" ? "Apple Watch" : "No watch");

/** Coach's Today: which athletes' watches need attention (quiet one-liner when all is well). */
export function WatchCard({ rows }: { rows: WatchRow[] }) {
  if (!rows.length) return null;
  const attention = rows.filter((r) => r.status.state === "attention");
  const none = rows.filter((r) => r.status.state === "none");
  const ok = rows.length - attention.length - none.length;
  return (
    <section id="watches" className="mt-6 scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5">
      <h2 className="flex items-center gap-2 font-medium">
        <Watch size={17} className="text-emerald-200" aria-hidden /> Watches
      </h2>
      <p className="mt-1 text-sm text-white/60">
        {attention.length === 0 && none.length === 0
          ? `All ${rows.length} syncing and up to date.`
          : [ok ? `${ok} fine` : null, attention.length ? `${attention.length} need${attention.length === 1 ? "s" : ""} attention` : null, none.length ? `${none.length} not connected` : null].filter(Boolean).join(" · ")}
      </p>
      {attention.length > 0 && (
        <ul className="mt-3 divide-y divide-white/[0.08]">
          {attention.map((r) => (
            <li key={r.id}>
              <Link href={`/athlete/${r.id}#workouts`} className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.04]">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-200" aria-label="Needs attention" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {r.name} <span className="font-normal text-white/50">· {deviceName(r.status.device)}</span>
                  </span>
                  {r.status.issues.map((i) => (
                    <span key={i.key} className="block text-xs text-white/65">
                      {i.text}
                    </span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {none.length > 0 && <p className="mt-2 text-xs text-white/50">Not connected: {none.map((r) => r.name).join(", ")}.</p>}
    </section>
  );
}

/** One athlete's line on the Athletes page: device, last sync and any problems. */
export function WatchLine({ status }: { status: WatchStatus }) {
  const dot = status.state === "ok" ? "bg-emerald-300 glow-green" : status.state === "attention" ? "bg-amber-300" : "bg-white/25";
  return (
    <div className="min-w-0 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span className={status.state === "none" ? "text-white/60" : status.state === "ok" ? "text-emerald-200" : "text-amber-100"}>
          {status.state === "none" ? "No watch yet" : deviceName(status.device)}
        </span>
        {status.device && (
          <span className="text-white/50">
            · {status.lastSync ? <SyncedAgo at={status.lastSync} /> : "not synced yet"}
          </span>
        )}
      </p>
      {status.state === "attention" &&
        status.issues.map((i) => (
          <p key={i.key} className="mt-0.5 text-xs text-amber-100/80">
            {i.text}
          </p>
        ))}
    </div>
  );
}

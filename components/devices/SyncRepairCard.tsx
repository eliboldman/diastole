import { RefreshCw } from "lucide-react";
import Link from "next/link";

/** Today / Connections: the watch went quiet, with the one tap that usually fixes it. */
export default function SyncRepairCard({ source, days, never }: { source: "garmin" | "apple"; days: number; never: boolean }) {
  const garmin = source === "garmin";
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[24px] border border-amber-300/25 bg-amber-300/[0.08] px-5 py-4">
      <RefreshCw size={18} className="shrink-0 text-amber-200" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-amber-50">
        {garmin
          ? never
            ? `Garmin hasn't sent any data since you connected ${days} days ago.`
            : `No data from Garmin in ${days} days.`
          : `Your Apple Watch data hasn't synced in ${days} days.`}
        <span className="block text-xs text-amber-50/70">
          {garmin ? "Reconnecting fixes this almost every time. Also check Garmin Connect is syncing on your phone." : "Open the Diastole app on your iPhone and keep it open for a moment."}
        </span>
      </p>
      {garmin ? (
        <a href="/api/garmin/connect" className="min-h-11 shrink-0 rounded-2xl bg-amber-200 px-4 py-3 text-sm font-semibold text-amber-950 active:scale-95">
          Reconnect Garmin
        </a>
      ) : (
        <Link href="/connect" className="min-h-11 shrink-0 rounded-2xl bg-amber-200 px-4 py-3 text-sm font-semibold text-amber-950 active:scale-95">
          Sync now
        </Link>
      )}
    </div>
  );
}

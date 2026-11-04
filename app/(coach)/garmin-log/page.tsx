import type { Metadata } from "next";

import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireCoach } from "@/lib/supabase/server";
import BackLink from "@/components/layout/BackLink";

export const metadata: Metadata = { title: "Garmin deliveries · Diastole" };

type Row = {
  id: number;
  received_at: string;
  host: string | null;
  outcome: "ok" | "bad_key" | "bad_json" | "ingest_error";
  counts: Record<string, number> | null;
  garmin_users: number | null;
  athletes_touched: number | null;
  error: string | null;
  duration_ms: number | null;
};

const OUTCOME = {
  ok: { label: "Stored", dot: "bg-emerald-300" },
  bad_key: { label: "Rejected: wrong secret", dot: "bg-red-300" },
  bad_json: { label: "Rejected: unreadable body", dot: "bg-red-300" },
  ingest_error: { label: "Failed to save (Garmin will retry)", dot: "bg-amber-300" },
} as const;

const TYPE_LABEL: Record<string, string> = {
  dailies: "dailies",
  sleeps: "sleep",
  hrv: "HRV",
  stressDetails: "stress",
  activities: "activities",
  manuallyUpdatedActivities: "edited activities",
  activityDetails: "activity details",
  userMetrics: "user metrics",
  deregistrations: "disconnects",
  userPermissionsChange: "permission changes",
};

function hostLabel(host: string | null) {
  if (!host) return "unknown address";
  return host.startsWith("diastole.app") ? "diastole.app" : host.includes("vercel.app") ? "legacy vercel.app" : host;
}

// Server-rendered per request, so "now" is the request time.
const requestTime = () => Date.now();

function ago(iso: string, now: number) {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

export default async function GarminLogPage() {
  const me = await requireCoach();
  const supabase = await createClient();
  const { data } = await supabase
    .from("garmin_webhook_log")
    .select("id, received_at, host, outcome, counts, garmin_users, athletes_touched, error, duration_ms")
    .order("received_at", { ascending: false })
    .limit(150);
  const rows = (data ?? []) as Row[];

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: me.timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const lastOk = rows.find((r) => r.outcome === "ok");
  const now = requestTime();
  const dayAgo = now - 86_400_000;
  const recent = rows.filter((r) => new Date(r.received_at).getTime() >= dayAgo);
  const problems = recent.filter((r) => r.outcome !== "ok").length;
  const stale = !lastOk || new Date(lastOk.received_at).getTime() < now - 12 * 3_600_000;

  return (
    <DashboardShell>
      <BackLink href="/account" label="Me" />
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Garmin deliveries</h1>
      <p className="mt-2 max-w-prose text-sm text-white/55">
        Every push Garmin sends, kept for 90 days. If nothing has arrived for half a day, check the sharing toggles in Garmin
        Connect or whether Garmin is holding pushes for review.
      </p>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur-2xl">
          <p className="text-xs uppercase tracking-[0.2em] text-white/45">Last stored</p>
          <p className={`mt-2 text-2xl font-semibold ${stale ? "text-amber-200" : ""}`}>{lastOk ? ago(lastOk.received_at, now) : "Nothing yet"}</p>
          {lastOk && <p className="mt-1 truncate text-xs text-white/45">via {hostLabel(lastOk.host)}</p>}
        </div>
        <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur-2xl">
          <p className="text-xs uppercase tracking-[0.2em] text-white/45">Last 24 hours</p>
          <p className="mt-2 text-2xl font-semibold">
            {recent.length} {recent.length === 1 ? "delivery" : "deliveries"}
          </p>
        </div>
        <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur-2xl">
          <p className="text-xs uppercase tracking-[0.2em] text-white/45">Problems, 24 h</p>
          <p className={`mt-2 text-2xl font-semibold ${problems ? "text-red-200" : ""}`}>{problems ? problems : "None"}</p>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-2 backdrop-blur-2xl sm:p-4">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-white/55">No deliveries logged yet. The next Garmin push will show up here.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {rows.map((r) => {
              const o = OUTCOME[r.outcome];
              const what = Object.entries(r.counts ?? {})
                .filter(([, n]) => n > 0)
                .map(([t, n]) => `${n} ${TYPE_LABEL[t] ?? t}`)
                .join(", ");
              return (
                <li key={r.id} className="flex gap-3 px-3 py-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${o.dot}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-sm font-medium">{o.label}</p>
                      <p className="text-xs text-white/45">{fmt.format(new Date(r.received_at))}</p>
                    </div>
                    {what && <p className="mt-0.5 break-words text-sm text-white/70">{what}</p>}
                    <p className="mt-0.5 truncate text-xs text-white/40">
                      {[hostLabel(r.host), r.athletes_touched ? `${r.athletes_touched} ${r.athletes_touched === 1 ? "athlete" : "athletes"} updated` : null, r.duration_ms != null ? `${r.duration_ms} ms` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {r.error && <p className="mt-1 break-words text-xs text-amber-200/80">{r.error}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}

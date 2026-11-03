import Link from "next/link";
import { notFound } from "next/navigation";

import { FLAG_STYLE, FlagBadge } from "@/components/coach/Flags";
import Sparkline, { fmt, lastNDays } from "@/components/coach/Sparkline";
import DashboardShell from "@/components/layout/DashboardShell";
import { getAthleteDetail } from "@/lib/coach-data";
import type { Flag } from "@/lib/readiness/engine";

const AREA_HELP: Record<string, string> = {
  recovery: "HRV and resting heart rate vs. the athlete's last 28 days",
  sleep: "Sleep duration (and Garmin sleep score) vs. baseline and minimums",
  stress: "Garmin all-day stress and Body Battery peak",
  load: "Last 7 days of training vs. the usual week (HR-weighted minutes)",
};

function detailLine(key: string, d: Record<string, unknown> | null | undefined) {
  if (!d) return null;
  const v = d as Record<string, Record<string, number> | number | undefined>;
  switch (key) {
    case "recovery": {
      const parts = [];
      if (v.hrv && typeof v.hrv === "object") parts.push(`HRV ${v.hrv.today} ms (baseline ${v.hrv.baseline}, ${v.hrv.pct > 0 ? "+" : ""}${v.hrv.pct}%)`);
      if (v.resting_hr && typeof v.resting_hr === "object")
        parts.push(`RHR ${v.resting_hr.today} bpm (baseline ${v.resting_hr.baseline})`);
      return parts.join(" · ") || null;
    }
    case "sleep":
      return v.sleep && typeof v.sleep === "object"
        ? `${v.sleep.hours} h${v.sleep.baseline_hours ? ` (usual ${v.sleep.baseline_hours} h)` : ""}${typeof v.sleep_score === "number" ? ` · score ${v.sleep_score}` : ""}`
        : null;
    case "stress": {
      const parts = [];
      if (v.stress && typeof v.stress === "object") parts.push(`stress ${v.stress.today} (usual ${v.stress.baseline})`);
      if (typeof v.body_battery_high === "number") parts.push(`Body Battery peak ${v.body_battery_high}`);
      return parts.join(" · ") || null;
    }
    case "load":
      return v.load && typeof v.load === "object" ? `7-day load ${v.load.acute} vs usual ${v.load.chronic_weekly} (×${v.load.ratio})` : null;
  }
  return null;
}

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getAthleteDetail(id);
  if (!data) notFound();

  const { profile, device, readiness, trend, activities, workouts } = data;
  const today = readiness[0];
  const overall: Flag = today?.overall ?? "unknown";

  return (
    <DashboardShell tone={overall === "red" ? "red" : overall === "yellow" ? "yellow" : "green"}>
      <Link href="/dashboard" className="text-sm text-white/45 hover:text-white">
        ← Today
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{profile.full_name || profile.email}</h1>
          <p className="mt-2 text-sm text-white/40">
            {device ? `${device.source === "garmin" ? "Garmin" : "Apple Watch"} connected` : "No device connected"}
            {profile.email ? ` · ${profile.email}` : ""}
          </p>
        </div>
        <FlagBadge flag={overall} large />
      </div>

      <section className="mt-8 rounded-[28px] border border-white/10 bg-black/30 p-6 backdrop-blur-xl">
        <p className="text-lg leading-relaxed text-white/80">{today?.note ?? "No readiness yet — waiting for data."}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {(["recovery", "sleep", "stress", "load"] as const).map((key) => {
            const flag: Flag = today?.[key] ?? "unknown";
            return (
              <div key={key} className="rounded-2xl border border-white/[0.06] bg-black/30 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium capitalize">{key}</p>
                  <span className={`inline-flex items-center gap-2 text-sm ${FLAG_STYLE[flag].text}`}>
                    <span className={`h-2 w-2 rounded-full ${FLAG_STYLE[flag].dot}`} aria-hidden />
                    {FLAG_STYLE[flag].label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/60">{detailLine(key, today?.details) ?? "—"}</p>
                <p className="mt-2 text-xs text-white/30">{AREA_HELP[key]}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-lg font-medium">Last 14 days</h2>
        <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Sparkline label="HRV" points={lastNDays(trend, "hrv_ms")} format={fmt.hrv} width={150} height={40} />
          <Sparkline label="Resting HR" points={lastNDays(trend, "resting_hr")} format={fmt.rhr} width={150} height={40} />
          <Sparkline label="Sleep" points={lastNDays(trend, "sleep_seconds")} format={fmt.sleep} width={150} height={40} />
          <Sparkline label="Stress" points={lastNDays(trend, "stress_avg")} format={fmt.stress} width={150} height={40} />
        </div>
        {readiness.length > 1 && (
          <div className="mt-6 flex flex-wrap gap-1.5" aria-label="Daily overall flags, oldest to newest">
            {[...readiness].reverse().map((r) => (
              <span key={r.date} title={`${r.date}: ${FLAG_STYLE[r.overall].label}`} className={`h-3 w-3 rounded-full ${FLAG_STYLE[r.overall].dot}`} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-lg font-medium">Recent training</h2>
          {activities.length === 0 ? (
            <p className="mt-3 text-sm text-white/40">No activities yet.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id} className="border-t border-white/[0.06]">
                    <td className="py-2 pr-3 text-white/50">
                      {new Date(a.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: profile.timezone })}
                    </td>
                    <td className="py-2 pr-3 capitalize">{a.sport?.replaceAll("_", " ") ?? "Activity"}</td>
                    <td className="py-2 pr-3 text-right text-white/70">{a.duration_s ? `${Math.round(a.duration_s / 60)} min` : ""}</td>
                    <td className="py-2 pr-3 text-right text-white/70">
                      {a.distance_m && a.distance_m > 100 ? `${(a.distance_m / 1000).toFixed(1)} km` : ""}
                    </td>
                    <td className="py-2 text-right text-white/50">{a.avg_hr ? `${Math.round(a.avg_hr)} bpm` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Planned workouts</h2>
            <Link
              href={`/athlete/${profile.id}/workouts/new`}
              className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-300/20"
            >
              + New workout
            </Link>
          </div>
          {workouts.length === 0 ? (
            <p className="mt-3 text-sm text-white/40">Nothing scheduled.</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {workouts.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/athlete/${profile.id}/workouts/${w.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border-t border-white/[0.06] px-2 py-2 hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0 truncate">
                      <span className="text-white/50">
                        {new Date(`${w.scheduled_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </span>{" "}
                      {w.title}
                    </span>
                    <span
                      className={`shrink-0 text-xs uppercase tracking-wider ${
                        w.status === "sent" ? "text-emerald-200/80" : w.status === "draft" ? "text-white/40" : "text-amber-200/80"
                      }`}
                    >
                      {w.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}

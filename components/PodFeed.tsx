import { FLAG_STYLE, FlagBadge, FlagRow } from "@/components/coach/Flags";
import Sparkline, { fmt, lastNDays } from "@/components/coach/Sparkline";
import type { Flag } from "@/lib/readiness/engine";

export type PodFeedData = {
  pod: { id: string; name: string };
  members: {
    id: string;
    name: string;
    is_me: boolean;
    readiness: { date: string; overall: Flag; recovery: Flag; sleep: Flag; stress: Flag; load: Flag; note: string } | null;
    wellness: { date: string; hrv_ms: number | null; resting_hr: number | null; sleep_seconds: number | null; stress_avg: number | null }[];
    activities: { sport: string | null; start_time: string; duration_s: number | null; distance_m: number | null; avg_hr: number | null }[];
  }[];
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function PodFeed({ feed, timeZone }: { feed: PodFeedData; timeZone: string }) {
  if (!feed.members.length) {
    return <p className="text-white/50">Nobody has joined this pod yet.</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {feed.members.map((m) => {
        const flag = m.readiness?.overall ?? "unknown";
        return (
          <article key={m.id} className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-tight">
                {m.name} {m.is_me && <span className="text-sm font-normal text-white/50">(you)</span>}
              </h2>
              <span className={`mt-1 h-4 w-4 shrink-0 rounded-full ${FLAG_STYLE[flag].dot} ${FLAG_STYLE[flag].glow}`} aria-hidden />
            </div>
            <div className="mt-2">
              <FlagBadge flag={flag} />
            </div>
            {m.readiness && (
              <>
                <p className="mt-2 text-sm text-white/60">{m.readiness.note}</p>
                <div className="mt-3">
                  <FlagRow flags={m.readiness} />
                </div>
              </>
            )}

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.09] pt-4">
              <Sparkline label="HRV" points={lastNDays(m.wellness, "hrv_ms")} format={fmt.hrv} />
              <Sparkline label="Resting HR" points={lastNDays(m.wellness, "resting_hr")} format={fmt.rhr} />
              <Sparkline label="Sleep" points={lastNDays(m.wellness, "sleep_seconds")} format={fmt.sleep} />
              <Sparkline label="Stress" points={lastNDays(m.wellness, "stress_avg")} format={fmt.stress} />
            </div>

            <div className="mt-5 border-t border-white/[0.09] pt-4">
              <p className="text-[11px] uppercase tracking-[0.15em] text-white/50">Recent training</p>
              {m.activities.length === 0 ? (
                <p className="mt-2 text-sm text-white/55">No activities yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {m.activities.slice(0, 5).map((a) => (
                    <li key={a.start_time} className="flex justify-between gap-3 text-white/70">
                      <span>
                        <span className="text-white/60">
                          {new Date(a.start_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone })}
                        </span>{" "}
                        {cap(a.sport?.replaceAll("_", " ") ?? "Activity")}
                      </span>
                      <span className="text-white/50">
                        {[a.duration_s && `${Math.round(a.duration_s / 60)} min`, a.distance_m && a.distance_m > 100 && `${(a.distance_m / 1000).toFixed(1)} km`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

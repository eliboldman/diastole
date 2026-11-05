import Link from "next/link";

import { shortDistance, type Units } from "@/lib/activity/format";
import { FLAG_STYLE, FlagBadge, FlagRow } from "@/components/coach/Flags";
import Sparkline, { fmt, lastNDays } from "@/components/coach/Sparkline";
import PodProps, { type PropSend, type PropTotal } from "@/components/PodProps";
import { ALL_STICKERS, podAwards } from "@/lib/pod-stickers";
import type { Flag } from "@/lib/readiness/engine";

export type PodPropsData = {
  totals: PropTotal[];
  recent: PropSend[];
};

export type PodFeedData = {
  pod: { id: string; name: string };
  members: {
    id: string;
    name: string;
    is_me: boolean;
    readiness: {
      date: string;
      overall: Flag;
      recovery: Flag;
      sleep: Flag;
      stress: Flag;
      load: Flag;
      note: string;
    } | null;
    wellness: {
      date: string;
      hrv_ms: number | null;
      resting_hr: number | null;
      sleep_seconds: number | null;
      stress_avg: number | null;
    }[];
    details?: boolean;
    activities: {
      id?: string;
      sport: string | null;
      start_time: string;
      duration_s: number | null;
      distance_m: number | null;
      avg_hr: number | null;
    }[];
  }[];
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1
    ? "just now"
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.round(m / 60)}h ago`
        : `${Math.round(m / 1440)}d ago`;
}

export default function PodFeed({
  feed,
  timeZone,
  props,
  units = "mi",
}: {
  feed: PodFeedData;
  timeZone: string;
  units?: Units;
  props: PodPropsData | null;
}) {
  if (!feed.members.length) {
    return <p className="text-white/50">Nobody has joined this pod yet.</p>;
  }
  const awards = podAwards(
    feed.members.map((m) => ({ ...m, name: m.name.split(" ")[0] })),
  );
  const firstName = (id: string) =>
    feed.members.find((m) => m.id === id)?.name.split(" ")[0] ?? "someone";
  const recent = (props?.recent ?? [])
    .filter((r) => ALL_STICKERS[r.sticker])
    .slice(0, 6);

  return (
    <div className="grid gap-6">
      {(awards.length > 0 || recent.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {awards.length > 0 && (
            <section className="rounded-[28px] border border-amber-200/15 bg-amber-200/[0.04] p-5">
              <p className="text-[11px] uppercase tracking-[0.15em] text-amber-200/80">
                This week&apos;s pod awards
              </p>
              <ul className="stagger mt-3 grid gap-2">
                {awards.map((a) => (
                  <li key={a.title} className="flex items-center gap-3">
                    <span className="text-2xl">{a.emoji}</span>
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">{a.title}</span> ·{" "}
                      {a.winner}
                      <span className="block text-xs text-white/55">
                        {a.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {recent.length > 0 && (
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[11px] uppercase tracking-[0.15em] text-white/50">
                Recently in the pod
              </p>
              <ul className="stagger mt-3 grid gap-2 text-sm">
                {recent.map((r) => (
                  <li
                    key={r.id}
                    className={`flex items-start justify-between gap-3 ${r.hidden ? "opacity-45" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="text-white/80">
                        {r.from_me ? "You" : r.from_name}
                      </span>
                      <span className="text-white/50"> sent </span>
                      <span className="tabular-nums">
                        {r.count.toLocaleString()}
                      </span>{" "}
                      {ALL_STICKERS[r.sticker].emoji}
                      <span className="text-white/50"> to </span>
                      {firstName(r.to_id)}
                      {r.note && (
                        <span className="block break-words text-white/65">
                          &ldquo;{r.note}&rdquo;
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-white/45">
                      {ago(r.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {feed.members.map((m) => {
          const flag = m.readiness?.overall ?? "unknown";
          return (
            <article
              key={m.id}
              className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight">
                  {m.name}{" "}
                  {m.is_me && (
                    <span className="text-sm font-normal text-white/50">
                      (you)
                    </span>
                  )}
                </h2>
                <span
                  className={`mt-1 h-4 w-4 shrink-0 rounded-full ${FLAG_STYLE[flag].dot} ${FLAG_STYLE[flag].glow}`}
                  aria-hidden
                />
              </div>
              <div className="mt-2">
                <FlagBadge flag={flag} />
              </div>
              {m.readiness && (
                <>
                  <p className="mt-2 text-sm text-white/60">
                    {m.readiness.note}
                  </p>
                  <div className="mt-3">
                    <FlagRow flags={m.readiness} />
                  </div>
                </>
              )}

              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.09] pt-4">
                <Sparkline
                  label="HRV"
                  points={lastNDays(m.wellness, "hrv_ms")}
                  format={fmt.hrv}
                />
                <Sparkline
                  label="Resting HR"
                  points={lastNDays(m.wellness, "resting_hr")}
                  format={fmt.rhr}
                />
                <Sparkline
                  label="Sleep"
                  points={lastNDays(m.wellness, "sleep_seconds")}
                  format={fmt.sleep}
                />
                <Sparkline
                  label="Stress"
                  points={lastNDays(m.wellness, "stress_avg")}
                  format={fmt.stress}
                />
              </div>

              <div className="mt-5 border-t border-white/[0.09] pt-4">
                <p className="text-[11px] uppercase tracking-[0.15em] text-white/50">
                  Recent training
                </p>
                {m.activities.length === 0 ? (
                  <p className="mt-2 text-sm text-white/55">
                    No activities yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {m.activities.slice(0, 5).map((a) => (
                      <li
                        key={a.start_time}
                        className="flex justify-between gap-3 text-white/70"
                      >
                        <span>
                          <span className="text-white/60">
                            {new Date(a.start_time).toLocaleDateString(
                              "en-US",
                              {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                timeZone,
                              },
                            )}
                          </span>{" "}
                          {m.details && a.id ? (
                            <Link href={`/activity/${a.id}`} className="text-emerald-100 underline-offset-2 hover:underline">
                              {cap(a.sport?.replaceAll("_", " ") ?? "Activity")}
                            </Link>
                          ) : (
                            cap(a.sport?.replaceAll("_", " ") ?? "Activity")
                          )}
                        </span>
                        <span className="text-white/50">
                          {[
                            a.duration_s &&
                              `${Math.round(a.duration_s / 60)} min`,
                            shortDistance(a.distance_m, units, a.sport),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {props && (
                <PodProps
                  podId={feed.pod.id}
                  member={m}
                  totals={props.totals.filter((t) => t.to_id === m.id)}
                  notes={props.recent.filter(
                    (r) => r.to_id === m.id && r.note,
                  )}
                />
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

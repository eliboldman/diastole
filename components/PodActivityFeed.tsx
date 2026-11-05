"use client";

import { Activity, Bike, Dumbbell, Footprints, Waves } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import PodProps from "@/components/PodProps";
import { clock, distance, speedText, sportLabel, whole, type Units } from "@/lib/activity/format";
import { swimDist, swimPace, swimPool } from "@/lib/activity/swim";
import { FEED_PAGE, type FeedItem } from "@/lib/pod-feed-types";
import { loadPodActivities } from "@/lib/pod-props-actions";
import { sportGroup } from "@/lib/pod-stickers";

const ICONS = { swim: Waves, run: Footprints, bike: Bike, strength: Dumbbell, other: Activity } as const;

function when(iso: string, timeZone: string) {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(x);
  const today = day(new Date());
  const yesterday = day(new Date(Date.now() - 86_400_000));
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  const label =
    day(d) === today ? "Today" : day(d) === yesterday ? "Yesterday" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
  return `${label} at ${time}`;
}

/** Up to three headline numbers, chosen per sport, never showing an empty one. */
function stats(a: FeedItem, u: Units): [string, string][] {
  const g = sportGroup(a.sport);
  const time: [string, string | null] = ["Time", clock(a.duration_s)];
  let rows: [string, string | null][];
  if (g === "swim") {
    const unit = a.pool_unit ?? swimPool(null, [], a.distance_m, u).unit;
    rows = [["Distance", swimDist(a.distance_m, unit)], ["Pace", swimPace(a.avg_speed_mps, unit)], time, ["Avg HR", whole(a.avg_hr, "bpm")]];
  } else if (g === "run") {
    rows = [["Distance", distance(a.distance_m, u)], ["Pace", speedText(a.avg_speed_mps, a.sport, u)], time, ["Avg HR", whole(a.avg_hr, "bpm")]];
  } else if (g === "bike") {
    rows = [
      ["Distance", distance(a.distance_m, u)],
      a.avg_power ? ["Avg power", whole(a.avg_power, "W")] : ["Speed", speedText(a.avg_speed_mps, a.sport, u)],
      time,
      ["Elevation", whole(a.elevation_gain_m, "m")],
    ];
  } else {
    rows = [time, ["Avg HR", whole(a.avg_hr, "bpm")], ["Load", whole(a.training_load, "")], ["Distance", distance(a.distance_m, u)]];
  }
  return rows.filter((r): r is [string, string] => Boolean(r[1])).slice(0, 3);
}

/** A small drawing of the route (no map tiles): lat/lon flattened with a cos(lat) correction. */
function RouteSketch({ route }: { route: [number, number][] }) {
  const lat0 = (route.reduce((a, p) => a + p[0], 0) / route.length) * (Math.PI / 180);
  const pts = route.map(([la, lo]) => [lo * Math.cos(lat0), -la] as const);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, y1 - y0) || 1;
  const W = 300;
  const H = 120;
  const scale = Math.min((W - 24) / (x1 - x0 || span), (H - 24) / (y1 - y0 || span));
  const ox = (W - (x1 - x0) * scale) / 2;
  const oy = (H - (y1 - y0) * scale) / 2;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${(ox + (p[0] - x0) * scale).toFixed(1)} ${(oy + (p[1] - y0) * scale).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 block h-28 w-full rounded-2xl border border-white/[0.07] bg-white/[0.025]" aria-hidden>
      <path d={d} fill="none" stroke="rgba(110,231,183,0.25)" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#6ee7b7" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function FeedCard({ a, podId, timeZone, units }: { a: FeedItem; podId: string; timeZone: string; units: Units }) {
  const g = sportGroup(a.sport);
  const Icon = ICONS[g];
  const label = sportLabel(a.sport);
  const title = a.name || label;
  const nums = stats(a, units);
  const first = a.athlete_name.split(" ")[0];
  // Stable between renders: PodProps keeps its instant (optimistic) counts until these change.
  const totals = useMemo(() => a.props.map((p) => ({ ...p, to_id: a.athlete_id })), [a.props, a.athlete_id]);
  const notes = useMemo(() => [...a.notes].reverse(), [a.notes]);
  const member = useMemo(() => ({ id: a.athlete_id, name: a.athlete_name, is_me: a.is_me }), [a.athlete_id, a.athlete_name, a.is_me]);
  const activity = useMemo(
    () => ({
      id: a.id,
      label: label.replace(/^Lap swimming$/, "Swim"),
      sport: a.sport,
      local_hour: a.local_hour,
      duration_s: a.duration_s,
      elevation_gain_m: a.elevation_gain_m,
      avg_hr: a.avg_hr,
    }),
    [a.id, label, a.sport, a.local_hour, a.duration_s, a.elevation_gain_m, a.avg_hr],
  );
  return (
    <article className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl sm:p-6">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300/30 to-sky-300/20 text-sm font-semibold text-emerald-50 ring-1 ring-white/10">
          {first.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {a.athlete_name}
            {a.is_me && <span className="font-normal text-white/50"> (you)</span>}
          </span>
          <span className="block truncate text-xs text-white/50">{when(a.start_time, timeZone)}</span>
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70" title={label}>
          <Icon size={17} aria-label={label} />
        </span>
      </header>

      <h3 className="mt-4 break-words text-lg font-semibold tracking-tight">
        {a.details ? (
          <Link href={`/activity/${a.id}`} className="hover:text-emerald-100 hover:underline">
            {title}
          </Link>
        ) : (
          title
        )}
      </h3>

      {nums.length > 0 && (
        <dl className="mt-3 grid grid-cols-3 gap-3">
          {nums.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="truncate text-[11px] uppercase tracking-[0.15em] text-white/45">{k}</dt>
              <dd className="mt-0.5 truncate text-base font-semibold tabular-nums sm:text-lg">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {a.route && a.route.length > 1 && <RouteSketch route={a.route} />}

      <PodProps podId={podId} member={member} totals={totals} notes={notes} activity={activity} />
    </article>
  );
}

export default function PodActivityFeed({ podId, initial, timeZone, units = "mi" }: { podId: string; initial: FeedItem[]; timeZone: string; units?: Units }) {
  // Pages loaded with "Load more"; the first page comes from the server so a refresh (after props) updates it.
  const [more, setMore] = useState<FeedItem[]>([]);
  const [done, setDone] = useState(initial.length < FEED_PAGE);
  const [pending, start] = useTransition();
  const seen = new Set(initial.map((a) => a.id));
  const items = [...initial, ...more.filter((a) => !seen.has(a.id))];

  if (!items.length) {
    return (
      <p className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 text-sm text-white/55">
        No workouts from the pod in the last 60 days yet. They&apos;ll show up here as watches sync.
      </p>
    );
  }

  const loadMore = () =>
    start(async () => {
      const next = await loadPodActivities(podId, items[items.length - 1].start_time);
      setMore((m) => [...m, ...next]);
      if (next.length < FEED_PAGE) setDone(true);
    });

  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      {items.map((a) => (
        <FeedCard key={a.id} a={a} podId={podId} timeZone={timeZone} units={units} />
      ))}
      {!done && (
        <button
          type="button"
          onClick={loadMore}
          disabled={pending}
          className="mx-auto min-h-11 rounded-2xl border border-white/10 bg-white/[0.05] px-5 text-sm text-white/80 transition hover:bg-white/[0.09] disabled:opacity-50"
        >
          {pending ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

"use client";

import { Activity, ArrowUp, Bike, Dumbbell, Footprints, MessageCircle, Trash2, Waves } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type PointerEvent, type RefObject } from "react";

import ActivityTitle from "@/components/activity/ActivityTitle";
import AvatarCircle from "@/components/avatar/AvatarCircle";
import { useToast } from "@/components/coach/Toast";
import PodProps from "@/components/PodProps";
import { clock, distance, speedText, sportLabel, whole, type Units } from "@/lib/activity/format";
import { swimDist, swimPace, swimPool } from "@/lib/activity/swim";
import { FEED_PAGE, type FeedComment, type FeedItem } from "@/lib/pod-feed-types";
import { deleteComment, hideOneProp, loadPodActivities, sendComment } from "@/lib/pod-props-actions";
import { ALL_STICKERS, NOTE_MAX, sportGroup, type SportGroup } from "@/lib/pod-stickers";
import { PR_LABEL } from "@/lib/avatar/pr-labels";
import Link from "next/link";

const ICONS = { swim: Waves, run: Footprints, bike: Bike, strength: Dumbbell, other: Activity } as const;
// One accent per sport: icon tint and the soft glow along the card's top edge.
const ACCENT: Record<SportGroup, { icon: string; glow: string }> = {
  swim: { icon: "text-sky-200 border-sky-300/25 bg-sky-300/10", glow: "from-sky-300/0 via-sky-300/40 to-sky-300/0" },
  run: { icon: "text-emerald-200 border-emerald-300/25 bg-emerald-300/10", glow: "from-emerald-300/0 via-emerald-300/40 to-emerald-300/0" },
  bike: { icon: "text-amber-200 border-amber-300/25 bg-amber-300/10", glow: "from-amber-300/0 via-amber-300/40 to-amber-300/0" },
  strength: { icon: "text-violet-200 border-violet-300/25 bg-violet-300/10", glow: "from-violet-300/0 via-violet-300/40 to-violet-300/0" },
  other: { icon: "text-white/70 border-white/10 bg-white/[0.05]", glow: "from-white/0 via-white/20 to-white/0" },
};

const dayKey = (d: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);

function dayLabel(iso: string, timeZone: string) {
  const d = new Date(iso);
  const k = dayKey(d, timeZone);
  if (k === dayKey(new Date(), timeZone)) return "Today";
  if (k === dayKey(new Date(Date.now() - 86_400_000), timeZone)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone });
}

function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
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

type LocalComment = FeedComment & { pending?: boolean };

/** The conversation under a workout: sticker notes and comments, plus a reply box. */
function Comments({
  a,
  podId,
  open,
  inputRef,
  onCount,
}: {
  a: FeedItem;
  podId: string;
  open: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onCount: (n: number) => void;
}) {
  const router = useRouter();
  const { show, element: toast } = useToast(4000);
  const [added, setAdded] = useState<LocalComment[]>([]);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const [text, setText] = useState("");
  const [, start] = useTransition();
  // Server rows win once they arrive; local ones fill the gap until the refresh.
  const serverIds = new Set(a.comments.map((c) => c.id));
  const list: LocalComment[] = [...a.comments, ...added.filter((c) => !serverIds.has(c.id) && !a.comments.some((s) => s.from_me && s.note === c.note))].filter((c) => !gone.has(c.id));
  const count = Math.max(a.comment_count - [...gone].filter((id) => serverIds.has(id)).length, 0) + list.filter((c) => !serverIds.has(c.id)).length;
  useEffect(() => onCount(count), [count, onCount]);
  const visible = all ? list : list.slice(-2);

  const post = () => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    const temp: LocalComment = {
      id: `local-${Date.now()}`,
      sticker: "comment",
      note: clean,
      hidden: false,
      created_at: new Date().toISOString(),
      from_me: true,
      to_me: a.is_me,
      from_name: "You",
      pending: true,
    };
    setAdded((x) => [...x, temp]);
    setText("");
    navigator.vibrate?.(8);
    start(async () => {
      const r = await sendComment(podId, a.athlete_id, a.id, clean);
      if (!r.ok) {
        setAdded((x) => x.filter((c) => c.id !== temp.id));
        setText(clean);
        show(r.error, { ok: false });
        return;
      }
      setAdded((x) => x.map((c) => (c.id === temp.id ? { ...c, pending: false } : c)));
      router.refresh();
    });
  };

  const remove = (c: FeedComment) =>
    start(async () => {
      setGone((g) => new Set(g).add(c.id));
      const r = c.sticker === "comment" && c.from_me ? await deleteComment(c.id) : await hideOneProp(c.id);
      if (!r.ok) {
        setGone((g) => {
          const n = new Set(g);
          n.delete(c.id);
          return n;
        });
        show(r.error, { ok: false });
        return;
      }
      router.refresh();
    });

  if (!list.length && !open) return toast;

  return (
    <div className="mt-4 border-t border-white/[0.08] pt-3">
      {list.length > 2 && !all && (
        <button type="button" onClick={() => setAll(true)} className="mb-2 min-h-9 text-sm text-white/50 hover:text-white/80">
          View all {count} comments
        </button>
      )}
      {visible.length > 0 && (
        <ul className="grid gap-2">
          {visible.map((c) => {
            const sticker = c.sticker !== "comment" ? ALL_STICKERS[c.sticker] : null;
            const canRemove = !c.pending && !c.id.startsWith("local-") && ((c.sticker === "comment" && c.from_me) || (c.to_me && !c.from_me));
            return (
              <li key={c.id} className={`row-in group flex items-start gap-2 text-sm ${c.hidden ? "opacity-45" : ""} ${c.pending ? "opacity-70" : ""}`}>
                <span className="min-w-0 flex-1 break-words">
                  <span className="font-medium text-white/90">{c.from_me ? "You" : c.from_name}</span>{" "}
                  {sticker && <span aria-label={sticker.label}>{sticker.emoji} </span>}
                  <span className="text-white/75">{c.note}</span>
                  <span className="ml-2 text-xs text-white/35">{c.pending ? "sending…" : ago(c.created_at)}</span>
                </span>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    aria-label={c.from_me ? "Delete comment" : "Hide comment"}
                    title={c.from_me ? "Delete" : "Hide"}
                    className="-my-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/30 transition hover:bg-white/[0.06] hover:text-red-200"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {open && (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            post();
          }}
        >
          <input
            ref={inputRef}
            value={text}
            maxLength={NOTE_MAX}
            onChange={(e) => setText(e.target.value)}
            placeholder={a.is_me ? "Reply…" : `Say something to ${a.athlete_name.split(" ")[0]}…`}
            aria-label="Comment"
            className="min-h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 text-base text-white placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none sm:text-sm"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Post comment"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-300/20 text-emerald-50 transition hover:bg-emerald-300/30 active:scale-90 disabled:bg-white/[0.05] disabled:text-white/30"
          >
            <ArrowUp size={18} />
          </button>
        </form>
      )}
      {toast}
    </div>
  );
}

/** Pod mates who did the same kind of workout starting within 20 minutes: they trained together. */
function together(a: FeedItem, all: FeedItem[]) {
  const g = sportGroup(a.sport);
  const t = Date.parse(a.start_time);
  const names = all
    .filter((b) => b.athlete_id !== a.athlete_id && sportGroup(b.sport) === g && Math.abs(Date.parse(b.start_time) - t) <= 20 * 60_000)
    .map((b) => (b.is_me ? "you" : b.athlete_name.split(" ")[0]));
  return [...new Set(names)];
}

const prValue = (key: string, v: number | null) => (v === null ? "" : key === "pr_power_20m" ? `${Math.round(v)} W` : clock(v));

function FeedCard({ a, podId, timeZone, units, look, with: mates }: { a: FeedItem; podId: string; timeZone: string; units: Units; look?: unknown; with: string[] }) {
  const g = sportGroup(a.sport);
  const Icon = ICONS[g];
  const accent = ACCENT[g];
  const label = sportLabel(a.sport);
  const nums = stats(a, units);
  const first = a.athlete_name.split(" ")[0];
  const time = new Date(a.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });

  // Stable between renders: PodProps keeps its instant (optimistic) counts until these change.
  const totals = useMemo(() => a.props.map((p) => ({ ...p, to_id: a.athlete_id })), [a.props, a.athlete_id]);
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

  // Double-tap the workout for a quick 👏, with a pop where you tapped.
  const quick = useRef<(() => void) | null>(null);
  const lastTap = useRef(0);
  const [pop, setPop] = useState<{ id: number; x: number; y: number } | null>(null);
  const onTap = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const now = e.timeStamp;
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      quick.current?.();
      if (!a.is_me) {
        const box = e.currentTarget.getBoundingClientRect();
        const id = now;
        setPop({ id, x: e.clientX - box.left, y: e.clientY - box.top });
        setTimeout(() => setPop((p) => (p?.id === id ? null : p)), 700);
      }
    } else lastTap.current = now;
  };

  const [commenting, setCommenting] = useState(false);
  const [count, setCount] = useState(a.comment_count);
  const input = useRef<HTMLInputElement>(null);
  const openComments = () => {
    setCommenting(true);
    requestAnimationFrame(() => input.current?.focus());
  };

  return (
    <article className="relative rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl transition hover:border-white/15 sm:p-6">
      <span className={`pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r ${accent.glow}`} aria-hidden />
      <header className="flex items-center gap-3">
        <Link href={`/profile/${a.athlete_id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl transition active:scale-[0.98]">
          <AvatarCircle look={look} name={first} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium hover:text-emerald-100">
              {a.athlete_name}
              {a.is_me && <span className="font-normal text-white/50"> (you)</span>}
            </span>
            <span className="block truncate text-xs text-white/50">{`${time} · ${label}`}</span>
          </span>
        </Link>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${accent.icon}`} title={label}>
          <Icon size={17} aria-label={label} />
        </span>
      </header>

      <ActivityTitle
        id={a.id}
        name={a.name}
        fallback={label}
        canRename={a.can_rename}
        href={a.details ? `/activity/${a.id}` : undefined}
        as="h3"
        className="mt-4 text-lg font-semibold tracking-tight"
      />

      {/* The double-tap area: numbers and route */}
      <div onPointerUp={onTap} className="relative select-none touch-manipulation">
        {(a.prs.length > 0 || mates.length > 0) && (
          <p className="mt-2 flex flex-wrap gap-1.5">
            {a.prs.map((p) => (
              <span key={p.key} className="success-pop rounded-full border border-amber-200/30 bg-amber-200/[0.08] px-3 py-1 text-xs text-amber-50">
                {`🏆 New ${(PR_LABEL[p.key] ?? "PR").replace(/^Fastest |^Best /, "")} PR · ${prValue(p.key, p.value)}`}
              </span>
            ))}
            {mates.length > 0 && (
              <span className="rounded-full border border-sky-200/25 bg-sky-200/[0.06] px-3 py-1 text-xs text-sky-50">{`🤝 Trained together with ${mates.join(" and ")}`}</span>
            )}
          </p>
        )}
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
        {pop && (
          <span key={pop.id} className="success-pop pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-5xl drop-shadow-lg" style={{ left: pop.x, top: pop.y }} aria-hidden>
            👏
          </span>
        )}
      </div>

      <PodProps
        podId={podId}
        member={member}
        totals={totals}
        notes={[]}
        activity={activity}
        quickRef={quick}
        actions={
          <button
            type="button"
            onClick={() => (commenting ? setCommenting(false) : openComments())}
            aria-expanded={commenting}
            className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition active:scale-95 ${
              commenting ? "border-white/20 bg-white/[0.09] text-white" : "border-white/10 bg-white/[0.05] text-white/75 hover:bg-white/[0.09]"
            }`}
          >
            <MessageCircle size={15} aria-hidden />
            {count > 0 ? <span className="tabular-nums">{count}</span> : "Comment"}
          </button>
        }
      />

      <Comments a={a} podId={podId} open={commenting} inputRef={input} onCount={setCount} />
    </article>
  );
}

export default function PodActivityFeed({
  podId,
  initial,
  timeZone,
  units = "mi",
  avatars = {},
}: {
  podId: string;
  initial: FeedItem[];
  timeZone: string;
  units?: Units;
  avatars?: Record<string, unknown>;
}) {
  // Pages loaded while scrolling; the first page comes from the server so a refresh (after props) updates it.
  const [more, setMore] = useState<FeedItem[]>([]);
  const [done, setDone] = useState(initial.length < FEED_PAGE);
  const [pending, start] = useTransition();
  const seen = new Set(initial.map((a) => a.id));
  const items = [...initial, ...more.filter((a) => !seen.has(a.id))];
  const last = items.at(-1)?.start_time;

  const sentinel = useRef<HTMLDivElement>(null);
  const loading = useRef(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || !last) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || loading.current) return;
        loading.current = true;
        start(async () => {
          const next = await loadPodActivities(podId, last);
          setMore((m) => [...m, ...next]);
          if (next.length < FEED_PAGE) setDone(true);
          loading.current = false;
        });
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [done, last, podId]);

  if (!items.length) {
    return (
      <div className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-center">
        <p className="text-3xl" aria-hidden>
          🌱
        </p>
        <p className="mt-3 font-medium">Quiet in here</p>
        <p className="mt-1 text-sm text-white/55">Workouts from the pod show up here as watches sync. Then the props start flying.</p>
      </div>
    );
  }

  // Group by day in the viewer's timezone.
  const groups: { label: string; items: FeedItem[] }[] = [];
  for (const a of items) {
    const label = dayLabel(a.start_time, timeZone);
    if (groups.at(-1)?.label === label) groups.at(-1)!.items.push(a);
    else groups.push({ label, items: [a] });
  }

  return (
    <div className="mx-auto max-w-2xl">
      {groups.map((grp) => (
        <section key={grp.label} className="mb-6">
          <h2 className="mb-3 px-1 text-[11px] uppercase tracking-[0.2em] text-white/45">{grp.label}</h2>
          <div className="stagger grid gap-4">
            {grp.items.map((a) => (
              <FeedCard key={a.id} a={a} podId={podId} timeZone={timeZone} units={units} look={avatars[a.athlete_id]} with={together(a, items)} />
            ))}
          </div>
        </section>
      ))}
      <div ref={sentinel} aria-hidden />
      {pending && <p className="py-4 text-center text-sm text-white/45">Loading more…</p>}
      {done && items.length > 3 && <p className="py-4 text-center text-xs uppercase tracking-[0.2em] text-white/30">That&apos;s the last 60 days</p>}
    </div>
  );
}

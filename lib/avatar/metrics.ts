// Builds the avatar page's metric cards from raw rows. Pure: values are formatted here so the
// client component only displays them.
import { paceOf, type Units } from "@/lib/activity/format";
import type { MetricCard } from "@/components/avatar/MetricCards";

type Zone = { field: string; value: number; changed_at: string };
type Day = { date: string; hrv_ms: number | null; resting_hr: number | null; vo2_max: number | null };
type Act = { start_time: string; duration_s: number | null; training_load: number | null; distance_m: number | null };

const short = (iso: string, timeZone: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(x);
  if (day(d) === day(new Date())) return "today";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: iso.length === 10 ? "UTC" : timeZone });
};
const month = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short" });
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function zoneCard(key: string, label: string, rows: Zone[], fmt: (v: number) => string, diff: (a: number, b: number) => { text: string; good: boolean } | null, timeZone: string, invert = false): MetricCard | null {
  if (!rows.length) return null;
  const last = rows.at(-1)!;
  const first = rows.find((r) => Date.now() - Date.parse(r.changed_at) < 365 * 86_400_000) ?? rows[0];
  const d = rows.length > 1 && first !== last ? diff(last.value, first.value) : null;
  return {
    key,
    label,
    value: fmt(last.value),
    sub: d ? `${d.text} since ${month(first.changed_at)}` : null,
    good: d?.good ?? null,
    updated: short(last.changed_at, timeZone),
    points: rows.map((r) => ({ t: r.changed_at, v: r.value })),
    invert,
    history: [...rows].reverse().map((r) => ({ date: short(r.changed_at, timeZone), text: fmt(r.value) })),
  };
}

export function buildMetricCards(o: { zones: Zone[]; days: Day[]; acts: Act[]; units: Units; timeZone: string }): MetricCard[] {
  const by = (f: string) => o.zones.filter((z) => z.field === f).map((z) => ({ ...z, value: Number(z.value) }));
  const pace = (v: number) => `${paceOf(v, o.units)} /${o.units}`;
  const cards: (MetricCard | null)[] = [
    zoneCard("ftp", "FTP", by("ftp_w"), (v) => `${Math.round(v)} W`, (a, b) => (a === b ? null : { text: `${a > b ? "+" : "−"}${Math.abs(Math.round(a - b))} W`, good: a > b }), o.timeZone),
    zoneCard(
      "pace",
      "Threshold pace",
      by("threshold_speed_mps"),
      pace,
      (a, b) => {
        const per = o.units === "mi" ? 1609.344 : 1000;
        const s = Math.round(per / b - per / a);
        return s === 0 ? null : { text: `${s > 0 ? "−" : "+"}${Math.abs(s)} s/${o.units}`, good: s > 0 };
      },
      o.timeZone,
    ),
    zoneCard("thr", "Threshold HR", by("threshold_hr"), (v) => `${Math.round(v)} bpm`, () => null, o.timeZone),
  ];

  // Daily metrics
  const daily = (key: keyof Day, label: string, unit: string, lowerBetter: boolean, window = 7, keepDays = 60) => {
    const pts = o.days.filter((d) => d[key] !== null && Date.now() - Date.parse(`${d.date}T12:00:00Z`) < keepDays * 86_400_000).map((d) => ({ t: `${d.date}T12:00:00Z`, v: Number(d[key]) }));
    if (!pts.length) return null;
    const recent = avg(pts.slice(-window).map((p) => p.v))!;
    const before = avg(pts.slice(-window * 5, -window).map((p) => p.v));
    const delta = before ? recent - before : 0;
    const good = Math.abs(delta) < 0.5 ? null : lowerBetter ? delta < 0 : delta > 0;
    return {
      key: String(key),
      label,
      value: `${Math.round(recent)} ${unit}`,
      sub: before && Math.round(delta) !== 0 ? `${window}-day avg · ${delta > 0 ? "+" : "−"}${Math.abs(Math.round(delta))} vs before` : `${window}-day avg`,
      good,
      updated: short(o.days.filter((d) => d[key] !== null).at(-1)!.date, o.timeZone),
      points: pts,
      history: [...pts].reverse().slice(0, 30).map((p) => ({ date: short(p.t, o.timeZone), text: `${Math.round(p.v)} ${unit}` })),
    } satisfies MetricCard;
  };
  const vo2 = o.days.filter((d) => d.vo2_max != null);
  cards.push(
    vo2.length
      ? {
          key: "vo2",
          label: "VO2 max",
          value: String(Math.round(Number(vo2.at(-1)!.vo2_max))),
          sub: null,
          updated: short(vo2.at(-1)!.date, o.timeZone),
          points: vo2.map((d) => ({ t: `${d.date}T12:00:00Z`, v: Number(d.vo2_max) })),
          history: [...vo2].reverse().slice(0, 30).map((d) => ({ date: short(d.date, o.timeZone), text: String(Math.round(Number(d.vo2_max))) })),
        }
      : null,
    daily("resting_hr", "Resting HR", "bpm", true),
    daily("hrv_ms", "HRV", "ms", false),
  );

  // Weekly volume and load, last 8 weeks (Monday weeks, viewer's timezone is close enough here).
  if (o.acts.length) {
    const weeks: { start: Date; h: number; load: number; n: number }[] = [];
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    for (let i = 7; i >= 0; i--) weeks.push({ start: new Date(monday.getTime() - i * 7 * 86_400_000), h: 0, load: 0, n: 0 });
    for (const a of o.acts) {
      const t = Date.parse(a.start_time);
      const w = [...weeks].reverse().find((x) => t >= x.start.getTime());
      if (!w) continue;
      w.h += (a.duration_s ?? 0) / 3600;
      w.load += a.training_load ?? 0;
      w.n += 1;
    }
    const cur = weeks.at(-1)!;
    const prev = avg(weeks.slice(0, -1).map((w) => w.h)) ?? 0;
    cards.push({
      key: "volume",
      label: "This week",
      value: `${cur.h.toFixed(1)} h`,
      sub: `${cur.n} ${cur.n === 1 ? "workout" : "workouts"}${cur.load ? ` · load ${Math.round(cur.load)}` : ""} · usual ${prev.toFixed(1)} h`,
      good: null,
      updated: null,
      points: weeks.map((w) => ({ t: w.start.toISOString(), v: w.h })),
      history: [...weeks].reverse().map((w) => ({
        date: `Week of ${w.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        text: `${w.h.toFixed(1)} h · ${w.n} workouts${w.load ? ` · load ${Math.round(w.load)}` : ""}`,
      })),
    });
  }
  return cards.filter((c): c is MetricCard => c !== null);
}

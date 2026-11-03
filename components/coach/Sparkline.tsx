// A single-series 14-day sparkline. Neutral ink line (status colors are reserved for flags),
// the label names the series, the latest value is shown as text, and each point has a
// hover tooltip via <title>. Days with no data leave a gap.

type Point = { date: string; value: number | null };

export default function Sparkline({
  label,
  points,
  format,
  width = 120,
  height = 32,
}: {
  label: string;
  points: Point[];
  format: (v: number) => string;
  width?: number;
  height?: number;
}) {
  const valid = points.filter((p): p is { date: string; value: number } => p.value !== null);
  const latest = valid.at(-1);

  if (valid.length < 2) {
    return (
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.15em] text-white/35">{label}</p>
        <p className="mt-1 text-sm text-white/70">{latest ? format(latest.value) : "—"}</p>
        <p className="text-[11px] text-white/30">{valid.length ? "trend after 2 days" : "no data yet"}</p>
      </div>
    );
  }

  const min = Math.min(...valid.map((p) => p.value));
  const max = Math.max(...valid.map((p) => p.value));
  const pad = 3;
  const x = (i: number) => pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2);
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2));

  // Break the line where days are missing.
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
    } else current.push(`${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  const lastIndex = points.findLastIndex((p) => p.value !== null);

  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-[0.15em] text-white/35">{label}</p>
      <div className="mt-1 flex items-end gap-3">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}, last ${points.length} days`} className="shrink-0 overflow-visible">
          {segments.map((s) => (
            <polyline key={s} points={s} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {points.map((p, i) =>
            p.value === null ? null : (
              <g key={p.date}>
                <circle cx={x(i)} cy={y(p.value)} r={i === lastIndex ? 3.5 : 0} fill="#fff" />
                {/* generous invisible hit target for the hover tooltip */}
                <circle cx={x(i)} cy={y(p.value)} r={7} fill="transparent">
                  <title>{`${p.date}: ${format(p.value)}`}</title>
                </circle>
              </g>
            ),
          )}
        </svg>
        <span className="text-sm text-white/80">{latest ? format(latest.value) : ""}</span>
      </div>
    </div>
  );
}

/** Builds a gap-aware series for the last `days` days ending today. */
export function lastNDays<T extends { date: string }>(rows: T[], key: keyof T, days = 14, today = new Date()): Point[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getTime() - (days - 1 - i) * 86400_000).toISOString().slice(0, 10);
    const row = rows.find((r) => r.date === d);
    const v = row?.[key];
    return { date: d, value: typeof v === "number" ? v : v == null ? null : Number(v) };
  });
}

export const fmt = {
  hrv: (v: number) => `${Math.round(v)} ms`,
  rhr: (v: number) => `${Math.round(v)} bpm`,
  sleep: (v: number) => `${Math.floor(v / 3600)}h${String(Math.round((v % 3600) / 60)).padStart(2, "0")}`,
  stress: (v: number) => `${Math.round(v)}`,
};

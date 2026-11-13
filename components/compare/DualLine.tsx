// Two athletes on one small line chart (same days, same scale). Gaps where a day has no data.
type Pt = number | null;

export default function DualLine({ title, days, a, b, fmt, names }: { title: string; days: string[]; a: Pt[]; b: Pt[]; fmt: (v: number) => string; names: [string, string] }) {
  const W = 320;
  const H = 90;
  const vals = [...a, ...b].filter((v): v is number => v !== null);
  const avg = (xs: Pt[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  if (!vals.length) {
    return (
      <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-2 text-sm text-white/50">No data for either athlete.</p>
      </div>
    );
  }
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => (i / Math.max(1, days.length - 1)) * (W - 8) + 4;
  const y = (v: number) => H - 6 - ((v - lo) / span) * (H - 12);
  const path = (xs: Pt[]) => {
    let d = "";
    let pen = false;
    xs.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const [ma, mb] = [avg(a), avg(b)];
  return (
    <figure className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-white/60">
          <span className="text-emerald-200">{names[0].split(" ")[0]} {ma !== null ? fmt(ma) : "—"}</span>
          {" · "}
          <span className="text-sky-200">{names[1].split(" ")[0]} {mb !== null ? fmt(mb) : "—"}</span>
          <span className="text-white/40"> avg</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-24 w-full" role="img" aria-label={`${title}: ${names[0]} averages ${ma !== null ? fmt(ma) : "no data"}, ${names[1]} ${mb !== null ? fmt(mb) : "no data"}`}>
        <path d={path(a)} fill="none" stroke="var(--color-emerald-300)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={path(b)} fill="none" stroke="var(--color-sky-300)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 3" />
      </svg>
      <div className="flex justify-between text-[11px] text-white/40">
        <span>{fmtDay(days[0])}</span>
        <span>{fmtDay(days[days.length - 1])}</span>
      </div>
    </figure>
  );
}

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

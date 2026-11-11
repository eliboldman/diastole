import type { Board, Camp } from "@/lib/camp/data";
import { addDays } from "@/lib/camp/data";

const UNIT: Record<Camp["goal_metric"], string> = { sessions: "sessions", hours: "hours", distance: "km" };

/** The collective goal: one bar for the whole camp. */
export function TeamGoal({ camp, board }: { camp: Camp; board: Board }) {
  const pct = Math.min(100, Math.round((board.total / camp.goal_value) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>Team goal</span>
        <span className="tabular-nums text-white/60">
          {board.total.toLocaleString("en-US")} / {Number(camp.goal_value).toLocaleString("en-US")} {UNIT[camp.goal_metric]}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.08]" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Team goal progress">
        <div className="h-full rounded-full bg-emerald-300 transition-[width] duration-700" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      {pct >= 100 && <p className="mt-1 text-xs text-emerald-200">Goal reached together.</p>}
    </div>
  );
}

/** Ticks: who's in and each camp day's sessions. Alphabetical, never ranked. */
export function Ticks({ camp, board, today, meId }: { camp: Camp; board: Board; today: string; meId?: string }) {
  const days: string[] = [];
  for (let d = camp.starts_on; d <= camp.ends_on; d = addDays(d, 1)) days.push(d);
  const members = board.members.filter((m) => m.in || Object.values(m.days).some((d) => d.done));
  if (!members.length) return <p className="text-sm text-white/55">Nobody&apos;s in yet. Be the first.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr>
            <th className="pr-2 text-left text-xs font-normal text-white/45">
              <span className="sr-only">Athlete</span>
            </th>
            {days.map((d) => (
              <th key={d} className={`min-w-6 px-0.5 text-center text-[10px] font-normal ${d === today ? "text-emerald-200" : "text-white/35"}`}>
                {new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "narrow", timeZone: "UTC" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <th scope="row" className="max-w-24 truncate pr-2 text-left font-normal">
                {m.name}
                {m.id === meId ? <span className="text-white/40"> (you)</span> : null}
                {!m.in && <span className="block text-[10px] text-white/35">stepped out</span>}
              </th>
              {days.map((d) => {
                const s = m.days[d];
                const label = !s ? "rest" : s.done >= s.planned ? "done" : d < today ? "not done" : "planned";
                return (
                  <td key={d} className="px-0.5 text-center" title={`${d}: ${label}`}>
                    <span
                      className={`mx-auto block h-5 w-5 rounded-md ${
                        !s ? "bg-transparent" : s.done >= s.planned ? "bg-emerald-300" : s.done > 0 ? "bg-emerald-300/50" : d < today ? "border border-white/15" : "border border-dashed border-white/20"
                      }`}
                      aria-label={label}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-white/40">Filled: done. Outline: planned. Missed days are just missed; the camp keeps going.</p>
    </div>
  );
}

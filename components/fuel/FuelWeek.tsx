// Last 7 days of logged eating for the coach: a quick read for daily check-ins. No judgments, just totals.
type Day = { date: string; meals: number; carbs: number; protein: number; fat: number; kcal: number };

const weekday = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });

export default function FuelWeek({ week }: { week: Day[] }) {
  if (!week.some((d) => d.meals)) return null;
  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-white/70">Last 7 days</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-white/45">
              <th className="py-1.5 pr-3 font-normal">Day</th>
              <th className="py-1.5 pr-3 font-normal">Meals</th>
              <th className="py-1.5 pr-3 font-normal text-emerald-200/80">Carbs</th>
              <th className="py-1.5 pr-3 font-normal text-sky-200/80">Protein</th>
              <th className="py-1.5 pr-3 font-normal text-amber-200/80">Fat</th>
              <th className="py-1.5 font-normal">kcal</th>
            </tr>
          </thead>
          <tbody>
            {week.map((d) => (
              <tr key={d.date} className="border-t border-white/[0.06] text-white/75">
                <td className="py-1.5 pr-3">{weekday(d.date)}</td>
                <td className="py-1.5 pr-3">{d.meals || "–"}</td>
                <td className="py-1.5 pr-3">{d.meals ? `${d.carbs} g` : "–"}</td>
                <td className="py-1.5 pr-3">{d.meals ? `${d.protein} g` : "–"}</td>
                <td className="py-1.5 pr-3">{d.meals ? `${d.fat} g` : "–"}</td>
                <td className="py-1.5">{d.meals ? d.kcal : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-white/40">Only what the athlete logged; an empty day just means nothing was logged.</p>
    </div>
  );
}

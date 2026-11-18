import { TESTS, testById, tighter, type Level, type Priority, type Result } from "@/lib/mobility/screen";

export const LEVEL: Record<Level, { word: string; cls: string }> = {
  0: { word: "Limited", cls: "border-amber-300/40 bg-amber-300/10 text-amber-100" },
  1: { word: "Fair", cls: "border-white/15 bg-white/[0.06] text-white/80" },
  2: { word: "Good", cls: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100" },
};

/** Every test with a chip per side; uneven sides called out. Server component, shared by athlete and coach views. */
export function ResultList({ results }: { results: Result[] }) {
  return (
    <ul className="divide-y divide-white/[0.06]">
      {TESTS.map((t) => {
        const r = results.find((x) => x.id === t.id);
        if (!r) return null;
        const side = tighter(r);
        return (
          <li key={t.id} className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t.short}</span>
              <span className="block text-xs text-white/45">
                {t.name}
                {side && <span className="text-amber-200/80">{` · ${side} side tighter`}</span>}
              </span>
            </span>
            <span className="flex shrink-0 gap-1.5">
              {(t.sided ? (["left", "right"] as const) : (["both"] as const)).map((s) => {
                const l = r.sides[s]!;
                const raw = r.raw[s];
                const unit = "unit" in t.measure ? (t.measure.unit === "cm" ? " cm" : " s") : "";
                return (
                  <span key={s} className={`rounded-full border px-2.5 py-1 text-xs ${LEVEL[l].cls}`}>
                    {s !== "both" && <span className="mr-1 opacity-60">{s === "left" ? "L" : "R"}</span>}
                    {unit ? `${raw}${unit}` : LEVEL[l].word}
                  </span>
                );
              })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function PriorityList({ pri }: { pri: Priority[] }) {
  if (!pri.length) return <p className="text-sm text-white/60">Nothing stands out. Your flows keep everything moving.</p>;
  return (
    <ol className="grid gap-2">
      {pri.map((p, i) => (
        <li key={p.id} className="flex gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-300/15 text-xs font-semibold text-emerald-100">{i + 1}</span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{testById(p.id)!.short}</span>
            <span className="block text-sm text-white/60">{p.reason}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

import Link from "next/link";

import { ring, type Macro, type Targets } from "@/lib/fuel/meals";

// Three nested rings, carbs outside, then protein, then fat. Each fills toward the bottom of the day's
// range and stays full past it: no red, no "over". Colors stay calm in both directions on purpose.
export const MACRO_STYLE: Record<Macro, { label: string; stroke: string; text: string }> = {
  carbs: { label: "Carbs", stroke: "#6ee7b7", text: "text-emerald-200" },
  protein: { label: "Protein", stroke: "#7dd3fc", text: "text-sky-200" },
  fat: { label: "Fat", stroke: "#fcd34d", text: "text-amber-200" },
};
const ORDER: Macro[] = ["carbs", "protein", "fat"];

export default function MacroRings({
  eaten,
  targets,
  numbers = true,
  size = "md",
  weightHref,
}: {
  eaten: { carbs: number; protein: number; fat: number; kcal: number };
  targets: Targets | null;
  numbers?: boolean;
  size?: "sm" | "md";
  weightHref?: string;
}) {
  const rings = ORDER.map((m) => ({ m, r: ring(eaten[m], targets?.[m] ?? null) }));
  const px = size === "sm" ? "h-16 w-16" : "h-28 w-28";
  return (
    <div className={`flex items-center ${size === "sm" ? "gap-4" : "gap-6"}`}>
      <div className={`shrink-0 ${px}`}>
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={rings.map(({ m, r }) => `${MACRO_STYLE[m].label} ${Math.round(r.fill * 100)}% of target`).join(", ")}>
          {rings.map(({ m, r }, i) => {
            const R = 52 - i * 15;
            const C = 2 * Math.PI * R;
            return (
              <g key={m}>
                <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
                {targets && (
                  <circle
                    cx="60"
                    cy="60"
                    r={R}
                    fill="none"
                    stroke={MACRO_STYLE[m].stroke}
                    strokeWidth="11"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    className="ring-fill"
                    style={{ ["--ring-from" as string]: C, ["--ring-to" as string]: C * (1 - Math.max(r.fill, 0.015)) }}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className={`min-w-0 text-sm ${size === "md" ? "space-y-1" : "space-y-0.5"}`}>
        {rings.map(({ m, r }) => {
          const t = targets?.[m];
          return (
            <li key={m} className="min-w-0">
              <span className="flex items-baseline gap-2">
                <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: MACRO_STYLE[m].stroke }} aria-hidden />
                <span className={`shrink-0 ${MACRO_STYLE[m].text}`}>{MACRO_STYLE[m].label}</span>
                {numbers ? (
                  <span className="tabular-nums text-white/80">{`${r.eaten} g`}</span>
                ) : (
                  <span className="text-white/50">{r.reached ? "there" : r.fill >= 0.5 ? "on the way" : ""}</span>
                )}
              </span>
              {numbers && t && size === "md" && <span className="block pl-4 text-xs tabular-nums text-white/40">{`target ${t.low}–${t.high} g`}</span>}
            </li>
          );
        })}
        {numbers && size === "md" && (
          <li className="pt-1 text-xs tabular-nums text-white/45">
            {`${Math.round(eaten.kcal)} kcal`}
            {targets ? ` · target ${targets.kcal.low}–${targets.kcal.high}` : ""}
          </li>
        )}
        {!targets && weightHref && (
          <li className="pt-1 text-xs">
            <Link href={weightHref} className="text-emerald-200 underline-offset-2 hover:underline">
              Add your weight
            </Link>
            <span className="text-white/45"> to see daily targets</span>
          </li>
        )}
      </ul>
    </div>
  );
}

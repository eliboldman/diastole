import type { Plate as PlateShares } from "@/lib/fuel/plan";

// A simple top-down plate: carbs (warm amber), protein (soft rose), fruit and veg (green).
const PARTS = [
  { key: "carbs", label: "Carbs", color: "#f2c879" },
  { key: "protein", label: "Protein", color: "#e9a3a0" },
  { key: "color", label: "Fruit and veg", color: "#7fdcb0" },
] as const;

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)].map((n) => n.toFixed(2)).join(" ");
  return `M ${cx} ${cy} L ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)} Z`;
}

export default function Plate({ plate, size = 120, legend = true }: { plate: PlateShares; size?: number; legend?: boolean }) {
  const slices = PARTS.map((p, i) => {
    const start = -Math.PI / 2 + PARTS.slice(0, i).reduce((t, q) => t + plate[q.key], 0) * Math.PI * 2;
    return { ...p, d: arc(50, 50, 38, start, start + plate[p.key] * Math.PI * 2) };
  });
  const words = PARTS.map((p) => `${p.label} ${Math.round(plate[p.key] * 100)}%`).join(", ");
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`Plate: ${words}`} className="shrink-0">
        <circle cx="50" cy="50" r="48" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" />
        {slices.map((s) => (
          <path key={s.key} d={s.d} fill={s.color} fillOpacity={0.82} stroke="#0d1513" strokeWidth="1.5" />
        ))}
        <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.18)" />
      </svg>
      {legend && (
        <ul className="space-y-1.5 text-sm text-white/75">
          {slices.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

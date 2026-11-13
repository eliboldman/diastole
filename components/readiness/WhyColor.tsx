import { FLAG_STYLE } from "@/components/coach/Flags";
import { detailLine } from "@/components/readiness/ReadinessDetail";
import type { Flag } from "@/lib/readiness/engine";

const AREAS = ["recovery", "sleep", "stress", "load"] as const;
const ORDER: Record<Flag, number> = { red: 0, yellow: 1, unknown: 2, green: 3 };

/** "Why this color?": the areas behind today's readiness, the ones pulling it down first, with the numbers. */
export default function WhyColor({ row }: { row: (Record<(typeof AREAS)[number], Flag> & { details: Record<string, unknown> | null }) | null }) {
  if (!row) return null;
  const areas = [...AREAS].sort((a, b) => ORDER[row[a] ?? "unknown"] - ORDER[row[b] ?? "unknown"]);
  return (
    <details className="group mt-3">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm text-emerald-200 hover:underline">Why this color?</summary>
      <ul className="mt-1 space-y-2">
        {areas.map((k) => {
          const f: Flag = row[k] ?? "unknown";
          const line = detailLine(k, row.details);
          return (
            <li key={k} className="flex items-start gap-2 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${FLAG_STYLE[f].dot}`} aria-hidden />
              <span>
                <span className="font-medium capitalize">{k}</span> <span className={FLAG_STYLE[f].text}>{f === "unknown" ? "no data" : f}</span>
                {line && <span className="block text-white/60">{line}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-white/40">Each area compares today with your own last 28 days. The overall color follows the weakest areas.</p>
    </details>
  );
}

import type { Flag } from "@/lib/readiness/engine";

// Status colors are reserved for readiness state and always ship with a text label.
export const FLAG_STYLE: Record<Flag, { dot: string; glow: string; label: string; text: string }> = {
  green: { dot: "bg-emerald-300", glow: "glow-green", label: "Ready", text: "text-emerald-200" },
  yellow: { dot: "bg-amber-300", glow: "glow-yellow", label: "Caution", text: "text-amber-200" },
  red: { dot: "bg-red-400", glow: "glow-red", label: "Recover", text: "text-red-200" },
  unknown: { dot: "bg-white/25", glow: "", label: "Building baseline", text: "text-white/45" },
};

export const FLAG_ORDER: Record<Flag, number> = { red: 0, yellow: 1, green: 2, unknown: 3 };

export function FlagBadge({ flag, large = false }: { flag: Flag; large?: boolean }) {
  const s = FLAG_STYLE[flag];
  return (
    <span className={`inline-flex items-center gap-2 ${large ? "text-base" : "text-sm"} ${s.text}`}>
      <span className={`${large ? "h-3.5 w-3.5" : "h-2.5 w-2.5"} shrink-0 rounded-full ${s.dot} ${s.glow}`} aria-hidden />
      {s.label}
    </span>
  );
}

const AREAS = [
  ["recovery", "Recovery"],
  ["sleep", "Sleep"],
  ["stress", "Stress"],
  ["load", "Load"],
] as const;

/** Four small labelled flags: Recovery · Sleep · Stress · Load. */
export function FlagRow({ flags }: { flags: Record<(typeof AREAS)[number][0], Flag> }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {AREAS.map(([key, label]) => {
        const s = FLAG_STYLE[flags[key]];
        return (
          <div key={key} className="rounded-xl border border-white/[0.06] bg-black/30 px-2 py-2 text-center" title={`${label}: ${s.label}`}>
            <span className={`mx-auto mb-1.5 block h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
            <span className="block text-[11px] text-white/55">{label}</span>
            <span className="sr-only">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

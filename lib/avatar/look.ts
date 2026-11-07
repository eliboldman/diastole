// An avatar "look": the athlete's own choices for the 3D mannequin. Only two clamped numbers are
// stored. Proportions are self-chosen: never set from data, never linked to weight.

export type Look = {
  build: number; // 0.85..1.15, how broad; self-chosen only
  height: number; // 0.9..1.1; self-chosen only
};

export const BUILD = { min: 0.85, max: 1.15 } as const;
export const HEIGHT = { min: 0.9, max: 1.1 } as const;
export const DEFAULT_LOOK: Look = { build: 1, height: 1 };

const clamp = (v: unknown, r: { min: number; max: number }) => (typeof v === "number" && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : 1);

/** Any stored JSON -> a valid look (older cartoon looks keep their sliders, everything else is dropped). */
export function normalizeLook(raw: unknown): Look {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    build: Math.round(clamp(r.build, BUILD) * 100) / 100,
    height: Math.round(clamp(r.height, HEIGHT) * 100) / 100,
  };
}

export const lookKey = (l: Look) => `${l.build.toFixed(2)}x${l.height.toFixed(2)}`;

// The current theme's accent as a plain "#rrggbb", for things that can't read CSS variables
// (the map's route line, the 3D avatar's glow). Browser only; falls back to Diastole green.
export function accentHex(shade: 200 | 300 | 400 = 300): string {
  const fallback = "#6ee7b7";
  if (typeof document === "undefined") return fallback;
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(`--color-emerald-${shade}`).trim();
    if (!value) return fallback;
    // Any CSS color (oklch included) → sRGB, by painting one pixel.
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.fillStyle = fallback;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return fallback;
  }
}

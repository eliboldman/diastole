// Barcode lookups: an Open Food Facts product -> one food for the confirm card.
// Pure module so it can be tested directly with `node`.
import type { EstimateItem } from "./meals.ts";

export const isBarcode = (code: string) => /^\d{8,14}$/.test(code);

type OFF = {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const g = (n: number) => Math.round(n * 10) / 10;

/** Null when the product has no usable carb/protein/fat numbers. */
export function productItem(p: OFF | null | undefined): { item: EstimateItem; label: string } | null {
  if (!p?.nutriments) return null;
  const n = p.nutriments;
  const name = [p.brands?.split(",")[0]?.trim(), p.product_name?.trim()].filter(Boolean).join(" ").slice(0, 80) || "Packaged food";
  const per = (k: string, suffix: string) => num(n[`${k}_${suffix}`]);

  // Per serving when the package says what a serving is; otherwise per 100 g.
  const serving = num(p.serving_quantity);
  let carbs = per("carbohydrates", "serving");
  let protein = per("proteins", "serving");
  let fat = per("fat", "serving");
  let portion = p.serving_size?.trim() ? `1 serving (${p.serving_size.trim().slice(0, 30)})` : "1 serving";
  if ((carbs == null || protein == null || fat == null) && serving && serving > 0) {
    const k = serving / 100;
    const c = per("carbohydrates", "100g");
    const pr = per("proteins", "100g");
    const f = per("fat", "100g");
    if (c != null && pr != null && f != null) [carbs, protein, fat] = [c * k, pr * k, f * k];
  }
  if (carbs == null || protein == null || fat == null) {
    carbs = per("carbohydrates", "100g");
    protein = per("proteins", "100g");
    fat = per("fat", "100g");
    portion = "100 g";
  }
  if (carbs == null || protein == null || fat == null) return null;
  if (carbs > 500 || protein > 500 || fat > 500) return null;
  // A label is exact, so the "range" is a single number.
  return { item: { name, portion, carbs: [g(carbs), g(carbs)], protein: [g(protein), g(protein)], fat: [g(fat), g(fat)] }, label: name.slice(0, 60) };
}

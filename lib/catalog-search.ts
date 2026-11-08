// Search shared by the shoe and bike catalogs. Pure (testable with `node`).

export type CatalogItem<K extends string = string> = { brand: string; model: string; kind: K };

/** Lowercase, accents off ("Cervélo" → "cervelo"), punctuation to spaces. */
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();

/**
 * Best matches for what's typed: every word must start a word in "brand model", or (3+ letters)
 * appear inside it with spaces ignored, so "peg 41" finds Pegasus (the version number aside),
 * "hoka mach" finds the Mach family and "cloud boom" finds Cloudboom. Exact-prefix models first.
 */
export function searchCatalog<T extends CatalogItem>(catalog: readonly T[], q: string, limit = 8): T[] {
  const words = norm(q).split(" ").filter(Boolean);
  if (!words.length) return [];
  const scored: { s: T; score: number }[] = [];
  for (const s of catalog) {
    const brand = norm(s.brand);
    const hay = `${brand} ${norm(s.model)}`.split(" ");
    const flat = hay.join("");
    // Numbers that are a version ("41") can be left unmatched; letters must all match.
    const unmatched = words.filter((w) => !hay.some((h) => h.startsWith(w)) && !(w.length >= 3 && flat.includes(w)));
    if (unmatched.some((w) => !/^\d+$/.test(w)) || unmatched.length === words.length) continue;
    const m = norm(s.model).replace(/ /g, "");
    const typed = words.filter((w) => !brand.split(" ").includes(w) && !/^\d+$/.test(w)).join("");
    const score = (m.startsWith(typed) ? 0 : 1) + (m === typed ? -0.5 : 0) + m.length / 100 + unmatched.length;
    scored.push({ s, score });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.s);
}

/** "Nike Pegasus" + what they typed after the family name ("41"), kept as the version. */
export function catalogLabel(s: CatalogItem, typed: string) {
  const version = norm(typed)
    .split(" ")
    .filter((w) => /^\d+(\.\d+)?$/.test(w))
    .find((w) => !norm(s.model).split(" ").includes(w));
  return `${s.brand} ${s.model}${version ? ` ${version}` : ""}`;
}

// The Grit store: everything grit can buy. Pure (server prices purchases from here; the page draws it).
// Grit is earned only. Nothing here costs money, and nothing here changes training.
// All art is Diastole's own (components/grit/Art.tsx and the 3D avatar).

export type Rarity = "common" | "rare";
export type Category = "sticker" | "jersey" | "helmet" | "aura" | "theme" | "ability";
export type Item = {
  id: string; // "<category>:<key>"; stickers' key is what pods send (g_ prefix)
  category: Category;
  name: string;
  blurb: string;
  price: number;
  rarity: Rarity;
  max?: number; // abilities: how many you can hold
  exclusive?: boolean; // boss reward: can't be bought, only earned by defeating a boss
};

// Jersey: torso colors on the 3D avatar. pattern: solid | band (chest band) | split (top/bottom) | hoops.
export type JerseyLook = { main: string; accent: string; pattern: "solid" | "band" | "split" | "hoops" };
export const JERSEYS: Record<string, JerseyLook> = {
  mint_band: { main: "#0f2e26", accent: "#6ee7b7", pattern: "band" },
  midnight: { main: "#151a2e", accent: "#334155", pattern: "solid" },
  sunrise: { main: "#f59e0b", accent: "#7c2d12", pattern: "split" },
  tidepool: { main: "#0e7490", accent: "#a5f3fc", pattern: "hoops" },
  lilac_split: { main: "#c4b5fd", accent: "#312e81", pattern: "split" },
  ember_hoops: { main: "#1c1917", accent: "#fb923c", pattern: "hoops" },
  // Boss rewards
  negative_split: { main: "#111827", accent: "#fde047", pattern: "split" },
  metronome: { main: "#0f766e", accent: "#f0fdfa", pattern: "hoops" },
};

// Helmet: shape + colors. glow = it softly lights up.
export type HelmetLook = { shape: "dome" | "aero" | "vented"; main: string; accent: string; glow?: boolean };
export const HELMETS: Record<string, HelmetLook> = {
  road_white: { shape: "vented", main: "#f1f5f9", accent: "#10b981" },
  aero_slate: { shape: "aero", main: "#1f2937", accent: "#6ee7b7" },
  dome_coral: { shape: "dome", main: "#fb7185", accent: "#fff1f2" },
  glow_mint: { shape: "aero", main: "#064e3b", accent: "#a7f3d0", glow: true },
  summit: { shape: "vented", main: "#78350f", accent: "#fcd34d", glow: true }, // boss reward
};

// Aura: the glow behind the avatar (the milestone aura keeps its strength; this changes its color).
export const AURAS: Record<string, { color: string; ring: string }> = {
  ember: { color: "#fb923c", ring: "#fdba74" },
  tide: { color: "#38bdf8", ring: "#7dd3fc" },
  bloom: { color: "#f472b6", ring: "#f9a8d4" },
  sunlit: { color: "#fde68a", ring: "#fbbf24" },
  riptide: { color: "#22d3ee", ring: "#a5f3fc" }, // boss reward
};

export const ITEMS: Item[] = [
  // Stickers & reactions (sent in pods like the free ones)
  { id: "sticker:g_sprout", category: "sticker", name: "Little sprout", blurb: "Growth, one session at a time.", price: 60, rarity: "common" },
  { id: "sticker:g_pulse", category: "sticker", name: "Steady pulse", blurb: "Calm heart, big engine.", price: 60, rarity: "common" },
  { id: "sticker:g_wave", category: "sticker", name: "Good wave", blurb: "Catch it and ride it.", price: 60, rarity: "common" },
  { id: "sticker:g_pebble", category: "sticker", name: "Pebble power", blurb: "Small. Unbothered. Rolling.", price: 60, rarity: "common" },
  { id: "sticker:g_spark", category: "sticker", name: "Spark plug", blurb: "Instant energy, no charger needed.", price: 60, rarity: "common" },
  { id: "sticker:g_comet", category: "sticker", name: "Comet tail", blurb: "Gone before you saw them.", price: 180, rarity: "rare" },
  { id: "sticker:g_aurora", category: "sticker", name: "Northern lights", blurb: "A session so good the sky noticed.", price: 180, rarity: "rare" },
  { id: "sticker:g_laurel", category: "sticker", name: "Laurels", blurb: "For the day it all came together.", price: 220, rarity: "rare" },
  // Avatar gear
  { id: "jersey:mint_band", category: "jersey", name: "Mint band", blurb: "Dark kit, one bright stripe.", price: 140, rarity: "common" },
  { id: "jersey:midnight", category: "jersey", name: "Midnight", blurb: "Quiet, fast, mostly dark.", price: 140, rarity: "common" },
  { id: "jersey:tidepool", category: "jersey", name: "Tidepool hoops", blurb: "Sea-glass stripes all round.", price: 160, rarity: "common" },
  { id: "jersey:sunrise", category: "jersey", name: "Sunrise", blurb: "Early start energy.", price: 160, rarity: "common" },
  { id: "jersey:lilac_split", category: "jersey", name: "Lilac split", blurb: "Two-tone, all tempo.", price: 300, rarity: "rare" },
  { id: "jersey:ember_hoops", category: "jersey", name: "Ember hoops", blurb: "Glowing coals on black.", price: 300, rarity: "rare" },
  { id: "helmet:road_white", category: "helmet", name: "Road lid", blurb: "Classic vents, clean white.", price: 150, rarity: "common" },
  { id: "helmet:dome_coral", category: "helmet", name: "Coral dome", blurb: "Round, bright, friendly.", price: 150, rarity: "common" },
  { id: "helmet:aero_slate", category: "helmet", name: "Slate aero", blurb: "Long tail for long days.", price: 220, rarity: "common" },
  { id: "helmet:glow_mint", category: "helmet", name: "Glow aero", blurb: "Softly lit from within.", price: 420, rarity: "rare" },
  { id: "aura:ember", category: "aura", name: "Ember aura", blurb: "A warm glow behind you.", price: 200, rarity: "common" },
  { id: "aura:tide", category: "aura", name: "Tide aura", blurb: "Cool water light.", price: 200, rarity: "common" },
  { id: "aura:bloom", category: "aura", name: "Bloom aura", blurb: "Petal pink.", price: 200, rarity: "common" },
  { id: "aura:sunlit", category: "aura", name: "Sunlit aura", blurb: "Golden hour, all day.", price: 450, rarity: "rare" },
  // Boss rewards: earned by defeating a weakness boss, never sold
  { id: "jersey:negative_split", category: "jersey", name: "Negative split", blurb: "For beating The Fizzle: faster at the end.", price: 1, rarity: "rare", exclusive: true },
  { id: "jersey:metronome", category: "jersey", name: "Metronome", blurb: "For beating Snoozlet: steady, week after week.", price: 1, rarity: "rare", exclusive: true },
  { id: "helmet:summit", category: "helmet", name: "Summit lid", blurb: "For beating Grumblehill. Glows at the top.", price: 1, rarity: "rare", exclusive: true },
  { id: "aura:riptide", category: "aura", name: "Riptide aura", blurb: "For beating Puddlewump.", price: 1, rarity: "rare", exclusive: true },
  // Themes (pick them in Settings → Appearance once owned)
  { id: "theme:lagoon", category: "theme", name: "Lagoon", blurb: "Clear turquoise water.", price: 250, rarity: "common" },
  { id: "theme:ember", category: "theme", name: "Ember", blurb: "Campfire orange.", price: 250, rarity: "common" },
  { id: "theme:aurora", category: "theme", name: "Aurora", blurb: "Green and violet night sky.", price: 500, rarity: "rare" },
  // Abilities
  { id: "ability:shield", category: "ability", name: "Streak shield", blurb: "Covers one missed planned day so your plan streak holds. Sick or injured days never break it anyway.", price: 80, rarity: "common", max: 3 },
  { id: "ability:boost", category: "ability", name: "Kudos boost", blurb: "Celebrate a pod mate: confetti on your pod's page for a day.", price: 60, rarity: "common", max: 5 },
];

export const ITEM: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const CATEGORY_LABEL: Record<Category, string> = {
  sticker: "Stickers & reactions",
  jersey: "Jerseys",
  helmet: "Helmets",
  aura: "Auras",
  theme: "Themes",
  ability: "Abilities",
};
export const keyOf = (id: string) => id.split(":")[1] ?? "";
export const isConsumable = (i: Item) => i.category === "ability";
/** Store themes need owning before they can be picked. */
export const STORE_THEMES = ITEMS.filter((i) => i.category === "theme").map((i) => keyOf(i.id));

// ---------------------------------------------------------------- equipped gear

export type Gear = { jersey?: string; helmet?: string; aura?: string };
export const GEAR_SLOTS = ["jersey", "helmet", "aura"] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];

/** Whatever is stored -> gear the app can draw (unknown ids dropped). */
export function normalizeGear(raw: unknown): Gear {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const g: Gear = {};
  if (typeof r.jersey === "string" && r.jersey in JERSEYS) g.jersey = r.jersey;
  if (typeof r.helmet === "string" && r.helmet in HELMETS) g.helmet = r.helmet;
  if (typeof r.aura === "string" && r.aura in AURAS) g.aura = r.aura;
  return g;
}
/** Gear stored with an avatar look (avatars.look.gear). */
export const gearOf = (look: unknown) => normalizeGear(look && typeof look === "object" ? (look as Record<string, unknown>).gear : null);

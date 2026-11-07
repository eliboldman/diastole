// An avatar "look": the athlete's own choices for the 3D figure. Body proportions are self-chosen:
// never set from data, never linked to weight. Everything else is a pick from the catalogs below,
// so a stored look can only ever hold known ids and clamped numbers.

// ---------------------------------------------------------------- catalogs

export type Swatch = { id: string; label: string; hex: string };

// Mint is the original mannequin: the default, so nobody is given a skin tone they didn't pick.
export const SKIN: Swatch[] = [
  { id: "mint", label: "Mint", hex: "#5fc79f" },
  { id: "porcelain", label: "Porcelain", hex: "#f6dccb" },
  { id: "fair", label: "Fair", hex: "#efc8ac" },
  { id: "light", label: "Light", hex: "#e2b28c" },
  { id: "warm", label: "Warm", hex: "#d49c72" },
  { id: "golden", label: "Golden", hex: "#c58b5c" },
  { id: "tan", label: "Tan", hex: "#ad7448" },
  { id: "brown", label: "Brown", hex: "#8d5a35" },
  { id: "deep", label: "Deep", hex: "#6b4126" },
  { id: "rich", label: "Rich", hex: "#4e2e1b" },
  { id: "ebony", label: "Ebony", hex: "#3a2214" },
  { id: "sky", label: "Sky", hex: "#7cc4e8" },
  { id: "lilac", label: "Lilac", hex: "#b9a3e3" },
];

export const HAIR_COLOR: Swatch[] = [
  { id: "black", label: "Black", hex: "#1c1714" },
  { id: "darkbrown", label: "Dark brown", hex: "#3b2519" },
  { id: "brown", label: "Brown", hex: "#6a4128" },
  { id: "auburn", label: "Auburn", hex: "#8a3b1e" },
  { id: "ginger", label: "Ginger", hex: "#c0612b" },
  { id: "blonde", label: "Blonde", hex: "#d8b46a" },
  { id: "platinum", label: "Platinum", hex: "#ece0c4" },
  { id: "gray", label: "Gray", hex: "#9a9a9a" },
  { id: "white", label: "White", hex: "#f1f1ee" },
  { id: "blue", label: "Blue", hex: "#3b6fd8" },
  { id: "pink", label: "Pink", hex: "#e47bb4" },
  { id: "green", label: "Green", hex: "#2f9e6e" },
];

export const EYE_COLOR: Swatch[] = [
  { id: "darkbrown", label: "Dark brown", hex: "#3a2416" },
  { id: "brown", label: "Brown", hex: "#6b4426" },
  { id: "hazel", label: "Hazel", hex: "#8a6a35" },
  { id: "amber", label: "Amber", hex: "#b07a22" },
  { id: "green", label: "Green", hex: "#4f7f45" },
  { id: "blue", label: "Blue", hex: "#3f76b8" },
  { id: "gray", label: "Gray", hex: "#6f7c86" },
  { id: "violet", label: "Violet", hex: "#7a5cb8" },
];

// Bright accent colors for headwear, glasses frames, shoes and the watch.
export const GEAR_COLOR: Swatch[] = [
  { id: "black", label: "Black", hex: "#1d2125" },
  { id: "white", label: "White", hex: "#f2f4f3" },
  { id: "red", label: "Red", hex: "#e0453a" },
  { id: "orange", label: "Orange", hex: "#f08a24" },
  { id: "yellow", label: "Yellow", hex: "#f4cf3a" },
  { id: "green", label: "Green", hex: "#34c47c" },
  { id: "teal", label: "Teal", hex: "#1fb5b0" },
  { id: "blue", label: "Blue", hex: "#2f6fe0" },
  { id: "navy", label: "Navy", hex: "#22325e" },
  { id: "purple", label: "Purple", hex: "#8a55d8" },
  { id: "pink", label: "Pink", hex: "#ec6aa7" },
  { id: "silver", label: "Silver", hex: "#b9c0c6" },
];

// The suit is the body itself, so it keeps away from the yellow/orange/red of worked muscles and
// the pinks of sore spots.
export const SUIT: Swatch[] = [
  { id: "mint", label: "Diastole green", hex: "#2fa47c" },
  { id: "teal", label: "Teal", hex: "#1f9a9a" },
  { id: "sky", label: "Sky", hex: "#3a8fc9" },
  { id: "blue", label: "Blue", hex: "#3463c4" },
  { id: "navy", label: "Navy", hex: "#2a3d73" },
  { id: "violet", label: "Violet", hex: "#6a52b8" },
  { id: "charcoal", label: "Charcoal", hex: "#3d454d" },
  { id: "silver", label: "Silver", hex: "#93a1ab" },
];

export const FACE_SHAPES = ["oval", "round", "long", "square", "heart"] as const;
export const HAIR_STYLES = [
  "none", "buzz", "short", "sidepart", "quiff", "curly", "afro", "bun", "ponytail", "bob", "long", "braids", "locs", "mohawk", "spiky",
] as const;
export const BROWS = ["thin", "straight", "arched", "thick", "angled", "bushy", "none"] as const;
export const EYES = ["dot", "round", "almond", "wide", "narrow", "lashes", "sleepy", "happy"] as const;
export const NOSES = ["button", "dot", "line", "wide", "pointed", "none"] as const;
export const MOUTHS = ["smile", "grin", "small", "neutral", "smirk", "open", "tongue", "determined"] as const;
export const FACIAL_HAIR = ["none", "stubble", "mustache", "handlebar", "goatee", "chinstrap", "beard"] as const;
export const MARKS = ["none", "freckles", "blush", "both"] as const;
export const GLASSES = ["none", "round", "square", "sport", "aviator", "goggles"] as const;
export const HEADWEAR = ["none", "cap", "visor", "beanie", "headband", "helmet", "aero", "swimcap", "wrap"] as const;
export const WATCH = ["none", "left", "right"] as const;

export const LABELS: Record<string, string> = {
  oval: "Oval", round: "Round", long: "Long", square: "Square", heart: "Heart",
  none: "None", buzz: "Buzz", short: "Short", sidepart: "Side part", quiff: "Quiff", curly: "Curly", afro: "Afro", bun: "Bun",
  ponytail: "Ponytail", bob: "Bob", braids: "Braids", locs: "Locs", mohawk: "Mohawk", spiky: "Spiky",
  thin: "Thin", straight: "Straight", arched: "Arched", thick: "Thick", angled: "Angled", bushy: "Bushy",
  dot: "Dot", almond: "Almond", wide: "Wide", narrow: "Narrow", lashes: "Lashes", sleepy: "Sleepy", happy: "Happy",
  button: "Button", line: "Line", pointed: "Pointed",
  smile: "Smile", grin: "Grin", small: "Small", neutral: "Neutral", smirk: "Smirk", open: "Open", tongue: "Tongue", determined: "Locked in",
  stubble: "Stubble", mustache: "Mustache", handlebar: "Handlebar", goatee: "Goatee", chinstrap: "Chinstrap", beard: "Beard",
  freckles: "Freckles", blush: "Blush", both: "Both",
  sport: "Sport wrap", aviator: "Aviator", goggles: "Swim goggles",
  cap: "Cap", visor: "Visor", beanie: "Beanie", headband: "Headband", helmet: "Bike helmet", aero: "Aero helmet", swimcap: "Swim cap", wrap: "Head wrap",
  left: "Left wrist", right: "Right wrist",
};
/** Display name for a catalog id. */
export const label = (id: string) => LABELS[id] ?? id;

// ---------------------------------------------------------------- the look

export type Look = {
  build: number; // 0.85..1.15, how broad; self-chosen only
  height: number; // 0.9..1.1; self-chosen only
  skin: string;
  face: (typeof FACE_SHAPES)[number];
  hair: (typeof HAIR_STYLES)[number];
  hairColor: string;
  brows: (typeof BROWS)[number];
  browY: number; // -1..1
  eyes: (typeof EYES)[number];
  eyeColor: string;
  eyeSize: number; // 0.75..1.3
  eyeGap: number; // 0.75..1.3
  eyeY: number; // -1..1
  nose: (typeof NOSES)[number];
  noseSize: number; // 0.75..1.3
  mouth: (typeof MOUTHS)[number];
  mouthSize: number; // 0.75..1.3
  mouthY: number; // -1..1
  facialHair: (typeof FACIAL_HAIR)[number];
  marks: (typeof MARKS)[number];
  glasses: (typeof GLASSES)[number];
  glassesColor: string;
  headwear: (typeof HEADWEAR)[number];
  headwearColor: string;
  suit: string;
  shoes: string;
  watch: (typeof WATCH)[number];
  watchColor: string;
};

export const BUILD = { min: 0.85, max: 1.15 } as const;
export const HEIGHT = { min: 0.9, max: 1.1 } as const;
export const SCALE = { min: 0.75, max: 1.3 } as const;
export const SHIFT = { min: -1, max: 1 } as const;

export const DEFAULT_LOOK: Look = {
  build: 1,
  height: 1,
  skin: "mint",
  face: "oval",
  hair: "none",
  hairColor: "darkbrown",
  brows: "straight",
  browY: 0,
  eyes: "dot",
  eyeColor: "brown",
  eyeSize: 1,
  eyeGap: 1,
  eyeY: 0,
  nose: "button",
  noseSize: 1,
  mouth: "smile",
  mouthSize: 1,
  mouthY: 0,
  facialHair: "none",
  marks: "none",
  glasses: "none",
  glassesColor: "black",
  headwear: "none",
  headwearColor: "blue",
  suit: "mint",
  shoes: "white",
  watch: "none",
  watchColor: "black",
};

const num = (v: unknown, r: { min: number; max: number }, d: number) =>
  Math.round((typeof v === "number" && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : d) * 100) / 100;
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : d);
const swatch = (v: unknown, list: Swatch[], d: string) => (typeof v === "string" && list.some((s) => s.id === v) ? v : d);

/** Any stored JSON -> a valid look. Older looks (just the two sliders) get the defaults for the rest. */
export function normalizeLook(raw: unknown): Look {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LOOK;
  return {
    build: num(r.build, BUILD, 1),
    height: num(r.height, HEIGHT, 1),
    skin: swatch(r.skin, SKIN, d.skin),
    face: pick(r.face, FACE_SHAPES, d.face),
    hair: pick(r.hair, HAIR_STYLES, d.hair),
    hairColor: swatch(r.hairColor, HAIR_COLOR, d.hairColor),
    brows: pick(r.brows, BROWS, d.brows),
    browY: num(r.browY, SHIFT, 0),
    eyes: pick(r.eyes, EYES, d.eyes),
    eyeColor: swatch(r.eyeColor, EYE_COLOR, d.eyeColor),
    eyeSize: num(r.eyeSize, SCALE, 1),
    eyeGap: num(r.eyeGap, SCALE, 1),
    eyeY: num(r.eyeY, SHIFT, 0),
    nose: pick(r.nose, NOSES, d.nose),
    noseSize: num(r.noseSize, SCALE, 1),
    mouth: pick(r.mouth, MOUTHS, d.mouth),
    mouthSize: num(r.mouthSize, SCALE, 1),
    mouthY: num(r.mouthY, SHIFT, 0),
    facialHair: pick(r.facialHair, FACIAL_HAIR, d.facialHair),
    marks: pick(r.marks, MARKS, d.marks),
    glasses: pick(r.glasses, GLASSES, d.glasses),
    glassesColor: swatch(r.glassesColor, GEAR_COLOR, d.glassesColor),
    headwear: pick(r.headwear, HEADWEAR, d.headwear),
    headwearColor: swatch(r.headwearColor, GEAR_COLOR, d.headwearColor),
    suit: swatch(r.suit, SUIT, d.suit),
    shoes: swatch(r.shoes, GEAR_COLOR, d.shoes),
    watch: pick(r.watch, WATCH, d.watch),
    watchColor: swatch(r.watchColor, GEAR_COLOR, d.watchColor),
  };
}

export const hexOf = (list: Swatch[], id: string) => (list.find((s) => s.id === id) ?? list[0]).hex;

/** A random look: every pick and slider (proportions included, as before). */
export function randomLook(rand: () => number = Math.random): Look {
  const any = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const between = (r: { min: number; max: number }) => r.min + rand() * (r.max - r.min);
  return normalizeLook({
    build: between(BUILD),
    height: between(HEIGHT),
    skin: any(SKIN).id,
    face: any(FACE_SHAPES),
    hair: any(HAIR_STYLES),
    hairColor: any(HAIR_COLOR).id,
    brows: any(BROWS),
    browY: between(SHIFT) * 0.6,
    eyes: any(EYES),
    eyeColor: any(EYE_COLOR).id,
    eyeSize: between({ min: 0.85, max: 1.2 }),
    eyeGap: between({ min: 0.85, max: 1.2 }),
    eyeY: between(SHIFT) * 0.6,
    nose: any(NOSES),
    noseSize: between({ min: 0.85, max: 1.2 }),
    mouth: any(MOUTHS),
    mouthSize: between({ min: 0.85, max: 1.2 }),
    mouthY: between(SHIFT) * 0.6,
    facialHair: rand() < 0.6 ? "none" : any(FACIAL_HAIR),
    marks: rand() < 0.6 ? "none" : any(MARKS),
    glasses: rand() < 0.6 ? "none" : any(GLASSES),
    glassesColor: any(GEAR_COLOR).id,
    headwear: rand() < 0.55 ? "none" : any(HEADWEAR),
    headwearColor: any(GEAR_COLOR).id,
    suit: any(SUIT).id,
    shoes: any(GEAR_COLOR).id,
    watch: rand() < 0.5 ? "none" : any(WATCH),
    watchColor: any(GEAR_COLOR).id,
  });
}

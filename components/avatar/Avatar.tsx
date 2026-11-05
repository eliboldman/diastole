"use client";

import { useId } from "react";

import { normalizeLook, PARTS, type Look } from "@/lib/avatar/look";

export type Mood = "fresh" | "ok" | "tired" | null;
/** How hard each area worked recently, 0..1 (from the last few days' training by sport). */
export type LoadAreas = Partial<Record<"legs" | "quads" | "shoulders" | "core", number>>;

export type AvatarState = {
  mood?: Mood; // today's readiness: fresh (green), ok (yellow), tired (red)
  load?: LoadAreas;
  aura?: number; // fitness progression level 0..4
  badges?: string[]; // emoji pins earned from milestones (max 3 shown)
};

type Props = AvatarState & {
  look: Look | unknown;
  variant?: "full" | "bust";
  blocks?: boolean; // the Blocks theme's pixel version
  className?: string;
  title?: string;
};

const color = (list: { id: string; value: string; shade?: string }[], id: string) => list.find((c) => c.id === id) ?? list[0];

function fill(markup: string, t: Record<string, string>) {
  return markup.replace(/\{(\w+)\}/g, (m, k: string) => t[k] ?? m);
}

const GLOW: Record<keyof LoadAreas, { cx: number; cy: number; rx: number; ry: number }> = {
  shoulders: { cx: 100, cy: 132, rx: 42, ry: 14 },
  core: { cx: 100, cy: 166, rx: 26, ry: 22 },
  quads: { cx: 100, cy: 214, rx: 30, ry: 20 },
  legs: { cx: 100, cy: 250, rx: 28, ry: 34 },
};

const MOUTH: Record<string, string> = {
  fresh: "<path d='M90 97 Q100 106 110 97' fill='none' stroke='#5b2b22' stroke-width='2.6' stroke-linecap='round'/>",
  ok: "<path d='M92 99 Q100 102 108 99' fill='none' stroke='#5b2b22' stroke-width='2.4' stroke-linecap='round'/>",
  tired: "<path d='M92 101 Q100 97 108 101' fill='none' stroke='#5b2b22' stroke-width='2.4' stroke-linecap='round'/>",
};

export default function Avatar({ look: raw, mood = null, load, aura = 0, badges = [], variant = "full", blocks = false, className = "", title }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const look = normalizeLook(raw);
  if (blocks) return <BlockAvatar look={look} mood={mood} aura={aura} variant={variant} className={className} title={title} />;

  const body = PARTS.bodies.find((b) => b.id === look.body)!;
  const face = PARTS.faces.find((f) => f.id === look.face)!;
  const skin = color(PARTS.colors.skin, look.skin);
  const hair = color(PARTS.colors.hair, look.hairColor);
  const outfit = color(PARTS.colors.outfit, look.outfitColor);
  const accent = color(PARTS.colors.accent, look.accent);
  const t = {
    skin: skin.value,
    skinShade: skin.shade!,
    hair: hair.value,
    hairShade: hair.shade!,
    outfit: outfit.value,
    outfitShade: outfit.shade!,
    accent: accent.value,
    id: uid,
  };
  const part = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id);
  const hairPart = part(PARTS.hair, look.hair)!;
  const outfitPart = part(PARTS.outfits, look.outfit)! as (typeof PARTS.outfits)[number] & { variants?: Record<string, string> };
  const outfitMarkup = outfitPart.variants?.[look.body] ?? outfitPart.markup;
  type Acc = (typeof PARTS.accessories)[number];
  const acc = look.accessories.map((a) => part(PARTS.accessories, a)).filter((a): a is Acc => Boolean(a));
  const accIn = (slots: string[]) =>
    acc
      .filter((a) => slots.includes(a.slot))
      .map((a) => a.markup)
      .join("");
  const hasHat = acc.some((a) => a.slot === "head");
  // Hats replace big hair at the top; long hair and tails still show beneath.
  const hairFront = hasHat && ["afro", "curly", "bun"].includes(look.hair) ? "" : hairPart.front;
  const hairBack = hasHat && look.hair === "bun" ? "" : hairPart.back;

  const bodyTransform = `translate(100 124) scale(${look.build} ${look.height}) translate(-100 -124)`;
  const glowColor = mood === "tired" ? "#f87171" : mood === "ok" ? "#fbbf24" : null;
  const level = Math.max(0, Math.min(4, Math.round(aura)));
  const viewBox = variant === "bust" ? "44 18 112 112" : "0 0 200 320";

  return (
    <svg viewBox={viewBox} className={className} role="img" aria-label={title ?? "Avatar"}>
      <defs>
        <clipPath id={`${uid}-torso`}>
          <path d={body.torso} />
        </clipPath>
        <clipPath id={`${uid}-arms`}>
          <path d={body.armL} />
          <path d={body.armR} />
        </clipPath>
        <clipPath id={`${uid}-legs`}>
          <path d={body.legL} />
          <path d={body.legR} />
        </clipPath>
        <radialGradient id={`${uid}-aura`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={level >= 4 ? "#fde68a" : "#6ee7b7"} stopOpacity={0.12 + level * 0.07} />
          <stop offset="70%" stopColor={level >= 4 ? "#fbbf24" : "#10b981"} stopOpacity={0.05 + level * 0.03} />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      {/* Fitness aura: grows with real milestones */}
      {level > 0 && (
        <g aria-hidden>
          <ellipse cx="100" cy="170" rx={70 + level * 6} ry={128 + level * 6} fill={`url(#${uid}-aura)`} />
          {level >= 2 && <ellipse cx="100" cy="292" rx="52" ry="8" fill="none" stroke={level >= 4 ? "#fbbf24" : "#6ee7b7"} strokeOpacity="0.45" strokeWidth="1.5" />}
          {level >= 3 && (
            <g className="avatar-orbit" style={{ transformOrigin: "100px 170px" }}>
              {[0, 72, 144, 216, 288].map((a) => (
                <circle key={a} cx={(100 + Math.cos((a * Math.PI) / 180) * 84).toFixed(1)} cy={(170 + Math.sin((a * Math.PI) / 180) * 130).toFixed(1)} r="2" fill={level >= 4 ? "#fde68a" : "#a7f3d0"} />
              ))}
            </g>
          )}
        </g>
      )}

      <g dangerouslySetInnerHTML={{ __html: fill(hairBack, t) }} />

      <g transform={bodyTransform}>
        <g fill={t.skin}>
          <path d={body.legL} />
          <path d={body.legR} />
          <g dangerouslySetInnerHTML={{ __html: body.feet }} />
          <path d={body.torso} />
          <path d={body.armL} />
          <path d={body.armR} />
          <g dangerouslySetInnerHTML={{ __html: body.hands }} />
        </g>
        <path d="M100 132 V190" stroke={t.skinShade} strokeOpacity="0.35" strokeWidth="1" />
        <g dangerouslySetInnerHTML={{ __html: fill(outfitMarkup, t) }} />
        <g dangerouslySetInnerHTML={{ __html: fill(part(PARTS.shoes, look.shoes)?.markup ?? "", t) }} />
        <g dangerouslySetInnerHTML={{ __html: fill(accIn(["wrist", "chest", "neck"]), t) }} />

        {/* Readiness: glow where training landed */}
        {glowColor && load && (
          <g filter={`url(#${uid}-blur)`} className="avatar-glow" aria-hidden>
            {(Object.keys(GLOW) as (keyof LoadAreas)[]).map((k) =>
              load[k] ? <ellipse key={k} {...GLOW[k]} fill={glowColor} opacity={0.14 + Math.min(1, load[k]!) * 0.3} /> : null,
            )}
          </g>
        )}

        {/* Milestone pins */}
        {badges.slice(0, 3).map((b, i) => (
          <g key={i} aria-hidden>
            <circle cx={82} cy={142 + i * 13} r="5.5" fill="#0b1220" stroke="#fde68a" strokeWidth="1" />
            <text x={82} y={145 + i * 13} textAnchor="middle" fontSize="7">
              {b}
            </text>
          </g>
        ))}
      </g>

      {/* Neck and head stay the same size whatever the sliders say */}
      <path d="M91 100 H109 V128 Q100 133 91 128 Z" fill={t.skin} />
      <path d="M91 108 Q100 116 109 108 V114 Q100 120 91 114 Z" fill={t.skinShade} />
      <g fill={t.skin} dangerouslySetInnerHTML={{ __html: face.ears }} />
      <path d={face.head} fill={t.skin} />
      <ellipse cx="84" cy="93" rx="5" ry="3" fill="#f87171" opacity={mood === "fresh" ? 0.22 : 0.1} />
      <ellipse cx="116" cy="93" rx="5" ry="3" fill="#f87171" opacity={mood === "fresh" ? 0.22 : 0.1} />
      <g dangerouslySetInnerHTML={{ __html: fill(part(PARTS.eyes, look.eyes)!.markup, t) }} />
      {mood === "tired" && <path d="M82 84.5 Q88 87 94 84.5 M106 84.5 Q112 87 118 84.5" fill="none" stroke={t.skinShade} strokeWidth="1.6" aria-hidden />}
      <g dangerouslySetInnerHTML={{ __html: fill(part(PARTS.brows, look.brows)!.markup, t) }} />
      <path d="M100 85 Q97 91 100 92" fill="none" stroke={t.skinShade} strokeWidth="1.8" strokeLinecap="round" />
      <g dangerouslySetInnerHTML={{ __html: MOUTH[mood ?? "ok"] }} />
      <g dangerouslySetInnerHTML={{ __html: fill(part(PARTS.facialHair, look.facialHair)?.markup ?? "", t) }} />
      <g dangerouslySetInnerHTML={{ __html: fill(hairFront, t) }} />
      <g dangerouslySetInnerHTML={{ __html: fill(accIn(["head", "eyes"]), t) }} />

      {/* Fresh: a few calm sparkles */}
      {mood === "fresh" && (
        <g className="avatar-sparkle" fill="#a7f3d0" aria-hidden>
          <path d="M150 52 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" />
          <path d="M48 96 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z" opacity="0.8" />
          <path d="M156 132 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z" opacity="0.7" />
        </g>
      )}
    </svg>
  );
}

/** The Blocks theme's version: the same look, in chunky pixels. */
function BlockAvatar({ look, mood, aura, variant, className, title }: { look: Look; mood: Mood; aura: number; variant: "full" | "bust"; className: string; title?: string }) {
  const skin = color(PARTS.colors.skin, look.skin);
  const hair = color(PARTS.colors.hair, look.hairColor);
  const outfit = color(PARTS.colors.outfit, look.outfitColor);
  const accent = color(PARTS.colors.accent, look.accent);
  const px = 8;
  const R = (x: number, y: number, w: number, h: number, f: string, k?: string) => <rect key={k ?? `${x}-${y}-${f}`} x={x * px} y={y * px} width={w * px} height={h * px} fill={f} />;
  const long = ["long", "braids", "ponytail"].includes(look.hair);
  const big = ["afro", "curly"].includes(look.hair);
  const bare = look.hair === "bald";
  const shades = look.accessories.includes("sunglasses") || look.accessories.includes("goggles");
  const hat = look.accessories.find((a) => ["cap", "beanie", "swimcap", "visor", "headband", "gold_band"].includes(a));
  const sleeves = ["bike", "casual", "pro_kit"].includes(look.outfit);
  const fullLegs = look.outfit === "casual";
  const level = Math.max(0, Math.min(4, Math.round(aura)));
  const viewBox = variant === "bust" ? `${5 * px} ${0} ${15 * px} ${15 * px}` : `0 0 ${25 * px} ${40 * px}`;
  return (
    <svg viewBox={viewBox} className={className} role="img" aria-label={title ?? "Avatar"} shapeRendering="crispEdges">
      {level > 0 && R(3, 1, 19, 38, level >= 4 ? "rgba(251,191,36,0.12)" : "rgba(110,231,183,0.1)", "aura")}
      {big && R(6, 1, 13, 6, hair.value, "bigHair")}
      {long && R(7, 5, 11, 11, hair.shade!, "longHair")}
      {/* head */}
      {R(8, 3, 9, 9, skin.value, "head")}
      {!bare && R(8, 2, 9, 3, hair.value, "hairTop")}
      {!bare && R(8, 5, 1, 3, hair.value, "hairL")}
      {!bare && R(16, 5, 1, 3, hair.value, "hairR")}
      {shades ? R(9, 7, 7, 1, "#0b1220", "shades") : [R(10, 7, 1, 1, "#1b1f24", "eyeL"), R(14, 7, 1, 1, "#1b1f24", "eyeR")]}
      {mood === "fresh" ? [R(11, 10, 3, 1, "#5b2b22", "m"), R(10, 9, 1, 1, "#5b2b22", "m1"), R(14, 9, 1, 1, "#5b2b22", "m2")] : R(11, 10, 3, 1, "#5b2b22", "m")}
      {look.facialHair === "beard" && R(8, 10, 9, 2, hair.value, "beard")}
      {hat && R(8, 1, 9, 2, hat === "gold_band" ? "#fbbf24" : hat === "headband" ? accent.value : outfit.value, "hat")}
      {/* body */}
      {R(11, 12, 3, 1, skin.value, "neck")}
      {R(8, 13, 9, 10, outfit.value, "torso")}
      {R(6, 13, 2, 10, sleeves ? outfit.value : skin.value, "armL")}
      {R(17, 13, 2, 10, sleeves ? outfit.value : skin.value, "armR")}
      {R(6, 23, 2, 2, skin.value, "handL")}
      {R(17, 23, 2, 2, skin.value, "handR")}
      {R(8, 23, 9, 3, outfit.shade!, "shorts")}
      {R(8, 26, 4, 9, fullLegs ? "#334155" : skin.value, "legL")}
      {R(13, 26, 4, 9, fullLegs ? "#334155" : skin.value, "legR")}
      {look.shoes !== "barefoot" && [R(7, 35, 5, 2, look.shoes === "racers" ? "#fde047" : outfit.value, "shoeL"), R(13, 35, 5, 2, look.shoes === "racers" ? "#fde047" : outfit.value, "shoeR")]}
      {mood === "tired" && R(8, 13, 9, 1, "rgba(248,113,113,0.6)", "tired")}
    </svg>
  );
}

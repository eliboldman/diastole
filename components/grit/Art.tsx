// Diastole's own art for the Grit store: sticker faces, gear and theme previews, and the grit mark.
// Plain SVG drawn here (no outside art), so it scales crisp everywhere and costs nothing to load.
import type { ReactNode } from "react";

import { AURAS, HELMETS, JERSEYS, keyOf, type Item } from "@/lib/grit/catalog";

const S = ({ children, size = 40, label }: { children: ReactNode; size?: number | string; label?: string }) => (
  <svg viewBox="0 0 48 48" width={size} height={size} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="shrink-0">
    {children}
  </svg>
);

/** The grit mark: a faceted stone with a spark, in the theme's accent. */
export function GritMark({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={`shrink-0 ${className}`}>
      <path d="M12 2.5 20 8l-2.6 10.2L12 21.5 6.6 18.2 4 8z" fill="var(--color-emerald-300)" />
      <path d="M12 2.5 20 8l-8 3.2L4 8z" fill="var(--color-emerald-100)" opacity=".9" />
      <path d="M12 11.2 17.4 18.2 12 21.5z" fill="var(--color-emerald-400)" />
      <path d="M12 11.2v10.3L6.6 18.2z" fill="var(--color-emerald-400)" opacity=".7" />
    </svg>
  );
}

const STICKERS: Record<string, ReactNode> = {
  g_sprout: (
    <>
      <circle cx="24" cy="24" r="21" fill="#0f2e26" />
      <path d="M24 38V22" stroke="#86efac" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 26c-8 0-12-5-12-11 7 0 12 4 12 11z" fill="#4ade80" />
      <path d="M24 22c0-7 5-11 12-11 0 6-4 11-12 11z" fill="#86efac" />
      <ellipse cx="24" cy="39" rx="9" ry="2.5" fill="#14532d" />
    </>
  ),
  g_pulse: (
    <>
      <circle cx="24" cy="24" r="21" fill="#10231f" />
      <path d="M24 35s-12-7.2-12-15.3A6.7 6.7 0 0 1 24 15.8a6.7 6.7 0 0 1 12 3.9C36 27.8 24 35 24 35z" fill="#34d399" />
      <path d="M8 25h9l2.5-5 4 10 3-7 2 2h11.5" fill="none" stroke="#ecfdf5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  g_wave: (
    <>
      <circle cx="24" cy="24" r="21" fill="#0c2a3a" />
      <path d="M6 30c4-1 6-12 15-12 6 0 8 5 6 8-1.5 2-4 1-4-1 0-3 6-4 9-1 3 3 6 5 10 5v7H6z" fill="#38bdf8" />
      <path d="M6 36c5 0 7-3 12-3s7 3 12 3 7-3 12-3v6H6z" fill="#7dd3fc" />
      <circle cx="35" cy="14" r="3" fill="#fde68a" />
    </>
  ),
  g_pebble: (
    <>
      <circle cx="24" cy="24" r="21" fill="#1f2421" />
      <path d="M11 30c0-8 6-15 14-15s12 5 12 12-5 9-13 9-13-1-13-6z" fill="#a8b5ad" />
      <path d="M14 26c1-5 5-8 10-8" stroke="#e2e8e4" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".7" />
      <circle cx="20" cy="27" r="1.6" fill="#1f2421" />
      <circle cx="28" cy="27" r="1.6" fill="#1f2421" />
      <path d="M21 31.5c2 1.5 4 1.5 6 0" stroke="#1f2421" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </>
  ),
  g_spark: (
    <>
      <circle cx="24" cy="24" r="21" fill="#2a210c" />
      <path d="M27 6 14 27h8l-3 15 15-22h-8z" fill="#fde047" />
      <path d="M27 6 22 20h5z" fill="#fef9c3" />
      <circle cx="11" cy="14" r="1.6" fill="#fde047" />
      <circle cx="38" cy="33" r="1.4" fill="#fde047" />
    </>
  ),
  g_comet: (
    <>
      <circle cx="24" cy="24" r="21" fill="#141432" />
      <path d="M8 38 30 18" stroke="#a78bfa" strokeWidth="7" strokeLinecap="round" opacity=".45" />
      <path d="M12 38 31 20" stroke="#c4b5fd" strokeWidth="4" strokeLinecap="round" opacity=".7" />
      <circle cx="32" cy="17" r="7" fill="#ede9fe" />
      <circle cx="30" cy="15" r="2.4" fill="#fff" />
      <circle cx="14" cy="13" r="1.2" fill="#fff" />
      <circle cx="39" cy="31" r="1" fill="#fff" />
    </>
  ),
  g_aurora: (
    <>
      <circle cx="24" cy="24" r="21" fill="#0b1426" />
      <path d="M5 26c6-10 12-14 19-9s12 3 19-5v10c-7 8-12 9-19 5S11 22 5 32z" fill="#34d399" opacity=".75" />
      <path d="M5 21c7-8 13-10 19-6s13 2 19-4v5c-6 6-12 7-19 3S12 16 5 25z" fill="#a78bfa" opacity=".7" />
      <path d="M6 38h36" stroke="#1e293b" strokeWidth="6" strokeLinecap="round" />
      <path d="m12 36 4-5 4 5zm14 0 5-7 5 7z" fill="#0f172a" />
    </>
  ),
  g_laurel: (
    <>
      <circle cx="24" cy="24" r="21" fill="#2a1f08" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <ellipse cx={14 - i * 0.6} cy={34 - i * 5} rx="2.6" ry="5" transform={`rotate(${-40 + i * 8} ${14 - i * 0.6} ${34 - i * 5})`} fill="#fbbf24" />
          <ellipse cx={34 + i * 0.6} cy={34 - i * 5} rx="2.6" ry="5" transform={`rotate(${40 - i * 8} ${34 + i * 0.6} ${34 - i * 5})`} fill="#fbbf24" />
        </g>
      ))}
      <circle cx="24" cy="24" r="5" fill="#fde68a" />
      <path d="M20 38h8" stroke="#fde68a" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
};

/** A store sticker's face (null for keys without art). */
export function StickerArt({ k, size = 28, label }: { k: string; size?: number | string; label?: string }) {
  const art = STICKERS[k];
  return art ? (
    <S size={size} label={label}>
      {art}
    </S>
  ) : null;
}
export const hasStickerArt = (k: string) => k in STICKERS;

function JerseyArt({ k, size }: { k: string; size: number }) {
  const j = JERSEYS[k];
  if (!j) return null;
  const body = "M14 10l6-3h8l6 3 8 7-5 6-3-2v20H14V21l-3 2-5-6z";
  return (
    <S size={size}>
      <defs>
        <clipPath id={`jc-${k}`}>
          <path d={body} />
        </clipPath>
      </defs>
      <path d={body} fill={j.main} />
      <g clipPath={`url(#jc-${k})`}>
        {j.pattern === "band" && <rect x="0" y="17" width="48" height="5" fill={j.accent} />}
        {j.pattern === "split" && <rect x="0" y="25" width="48" height="23" fill={j.accent} />}
        {j.pattern === "hoops" && [12, 22, 32].map((y) => <rect key={y} x="0" y={y} width="48" height="4.5" fill={j.accent} />)}
        {j.pattern === "solid" && <rect x="0" y="6" width="48" height="4" fill={j.accent} />}
      </g>
      <path d="M20 7c1 3 7 3 8 0" stroke="rgba(255,255,255,.5)" strokeWidth="1.4" fill="none" />
      <path d={body} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1" />
    </S>
  );
}

function HelmetArt({ k, size }: { k: string; size: number }) {
  const h = HELMETS[k];
  if (!h) return null;
  const shell = h.shape === "aero" ? "M7 30c0-11 9-18 19-18 9 0 14 6 15 12l2 6-10 3H7z" : h.shape === "dome" ? "M8 31c0-10 7-17 16-17s16 7 16 17z" : "M7 31c0-10 8-17 17-17s17 7 17 17l-3 1H9z";
  return (
    <S size={size}>
      {h.glow && <ellipse cx="24" cy="26" rx="20" ry="13" fill={h.accent} opacity=".25" />}
      <path d={shell} fill={h.main} stroke="rgba(255,255,255,.35)" strokeWidth="1" />
      {h.shape === "vented" && [16, 23, 30].map((x) => <path key={x} d={`M${x} 18q1 4 0 9`} stroke={h.accent} strokeWidth="2.6" strokeLinecap="round" fill="none" />)}
      <path d={h.shape === "aero" ? "M9 27c6-9 18-12 30-3" : "M10 27c6-8 22-8 28 0"} stroke={h.accent} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M12 33h22" stroke="rgba(255,255,255,.35)" strokeWidth="2" strokeLinecap="round" />
    </S>
  );
}

function AuraArt({ k, size }: { k: string; size: number }) {
  const a = AURAS[k];
  if (!a) return null;
  return (
    <S size={size}>
      <defs>
        <radialGradient id={`ag-${k}`}>
          <stop offset="0" stopColor={a.color} stopOpacity=".9" />
          <stop offset="1" stopColor={a.color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="22" r="21" fill={`url(#ag-${k})`} />
      <ellipse cx="24" cy="40" rx="14" ry="3" fill="none" stroke={a.ring} strokeWidth="1.6" />
      <circle cx="24" cy="15" r="5" fill="#2fa47c" />
      <path d="M16 39c0-10 3-17 8-17s8 7 8 17z" fill="#2fa47c" />
    </S>
  );
}

const THEME_ART: Record<string, string[]> = { lagoon: ["#0b2427", "#5eead4"], ember: ["#24150b", "#fb923c"], aurora: ["#151231", "#6ee7b7", "#a78bfa"] };
function ThemeArt({ k, size }: { k: string; size: number }) {
  const c = THEME_ART[k];
  if (!c) return null;
  return (
    <S size={size}>
      <rect x="4" y="8" width="40" height="32" rx="9" fill={c[0]} />
      <circle cx="13" cy="17" r="4" fill={c[1]} />
      <rect x="20" y="14" width="18" height="3" rx="1.5" fill={c[2] ?? c[1]} opacity=".8" />
      <rect x="20" y="20" width="12" height="2.4" rx="1.2" fill="#fff" opacity=".3" />
      <rect x="10" y="28" width="28" height="7" rx="3.5" fill={c[1]} />
    </S>
  );
}

function AbilityArt({ k, size }: { k: string; size: number }) {
  if (k === "shield")
    return (
      <S size={size}>
        <path d="M24 5 39 11v11c0 10-6.5 17-15 21C15.5 39 9 32 9 22V11z" fill="#0f2e26" stroke="var(--color-emerald-300)" strokeWidth="2" />
        <path d="M24 13c-4 5-7 8-7 12a7 7 0 0 0 14 0c0-4-3-7-7-12z" fill="#fb923c" />
        <path d="M24 20c-2 3-3 4-3 6a3 3 0 0 0 6 0c0-2-1-3-3-6z" fill="#fde68a" />
      </S>
    );
  return (
    <S size={size}>
      {[
        [10, 12, "#6ee7b7", 20],
        [36, 10, "#fde68a", -30],
        [40, 30, "#f9a8d4", 45],
        [8, 32, "#7dd3fc", -15],
        [24, 6, "#c4b5fd", 10],
      ].map(([x, y, c, r], i) => (
        <rect key={i} x={Number(x) - 2.5} y={Number(y) - 4} width="5" height="8" rx="1.2" fill={String(c)} transform={`rotate(${r} ${x} ${y})`} />
      ))}
      <path d="M24 38s-11-6.5-11-14a6 6 0 0 1 11-3.4A6 6 0 0 1 35 24c0 7.5-11 14-11 14z" fill="var(--color-emerald-300)" />
    </S>
  );
}

/** The picture for any store item. */
export function ItemArt({ item, size = 48 }: { item: Item; size?: number }) {
  const k = keyOf(item.id);
  switch (item.category) {
    case "sticker":
      return <StickerArt k={k} size={size} />;
    case "jersey":
      return <JerseyArt k={k} size={size} />;
    case "helmet":
      return <HelmetArt k={k} size={size} />;
    case "aura":
      return <AuraArt k={k} size={size} />;
    case "theme":
      return <ThemeArt k={k} size={size} />;
    default:
      return <AbilityArt k={k} size={size} />;
  }
}

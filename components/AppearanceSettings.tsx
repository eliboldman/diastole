"use client";

import { HeartPulse, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { applyLook, BACKGROUNDS, CORNERS, DEFAULT_LOOK, DENSITIES, LOOK_COOKIE, lookCookie, TEXT_SIZES, type Look } from "@/lib/appearance";
import { eggState, findSecret } from "@/lib/secrets-client";
import { addSecret, hasSecret } from "@/lib/secrets-local";
import { saveAppearance } from "@/lib/theme-actions";
import { THEME_COOKIE, THEMES, type ThemeId } from "@/lib/themes";

const SECRET_TAPS = 5;
const YEAR = 60 * 60 * 24 * 400;
const small = "mb-2 text-[11px] uppercase tracking-[0.15em] text-white/50";

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`min-h-10 min-w-0 truncate rounded-xl px-2 text-sm ${value === o.id ? "bg-white/[0.12] text-white" : "text-white/60 hover:text-white"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-12 w-full items-center justify-between gap-4 text-left">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-white/50">{hint}</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-emerald-300" : "bg-white/15"}`} aria-hidden>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div>
    <p className={small}>{title}</p>
    {children}
  </div>
);

/** Color theme plus background, glow, text size, corners, spacing and motion. Changes show right away and save on their own. */
export default function AppearanceSettings({ initialTheme, initialLook, unlock, owned = [] }: { initialTheme: ThemeId; initialLook: Look; unlock?: string; owned?: string[] }) {
  const [theme, setThemeState] = useState<ThemeId>(initialTheme);
  const [look, setLook] = useState<Look>(initialLook);
  const [found, setFound] = useState(initialTheme === "blocks");
  const [icarus, setIcarus] = useState(initialTheme === "icarus");

  const [hint, setHint] = useState<string | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const taps = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, start] = useTransition();

  // Paint now (and on this device's cookie, so the next page load starts right).
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme;
    applyLook(el, look);
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${YEAR}; samesite=lax`;
    document.cookie = `${LOOK_COOKIE}=${lookCookie(look)}; path=/; max-age=${YEAR}; samesite=lax`;
  }, [theme, look]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const save = (t: ThemeId, l: Look) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSaved("saving");
      start(async () => {
        const r = await saveAppearance(t, l);
        setSaved(r.ok ? "saved" : "error");
      });
    }, 500);
  };
  const pickTheme = (id: ThemeId) => {
    setThemeState(id);
    save(id, look);
  };
  const set = (patch: Partial<Look>) => {
    const next = { ...look, ...patch };
    setLook(next);
    save(theme, next);
  };
  const reset = () => {
    setThemeState("diastole");
    setLook(DEFAULT_LOOK);
    save("diastole", DEFAULT_LOOK);
  };

  // Icarus: found by typing "icarus" into search (remembered on this device), or already in use.
  useEffect(() => {
    const t = setTimeout(() => {
      if (hasSecret("blocks")) setFound(true);
      if (unlock === "icarus") {
        addSecret("icarus");
        void findSecret("icarus");
        setIcarus(true);
        setHint("You found Icarus. ☀️ Fly high, just not too close to the sun.");
        setThemeState("icarus");
        save("icarus", look);
      } else if (hasSecret("icarus")) {
        setIcarus(true);
        // Found on this device before the collection existed: put it on the account.
        if (!eggState().found.includes("icarus")) void findSecret("icarus");
      }
    }, 0);
    return () => clearTimeout(t);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tap = () => {
    if (found) return;
    taps.current += 1;
    const left = SECRET_TAPS - taps.current;
    if (left <= 0) {
      setFound(true);
      setHint("You found Blocks.");
      void findSecret("blocks");
    } else if (left <= 3) setHint(`${left} more…`);
  };

  const isDefault = theme === "diastole" && JSON.stringify(look) === JSON.stringify(DEFAULT_LOOK);

  return (
    <div className="space-y-6">
      {/* A small preview of what the settings do */}
      <div className="app-canvas overflow-hidden rounded-2xl border border-white/10 p-4">
        <div className="rounded-2xl border border-white/10 bg-panel p-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={tap} aria-label="Diastole" className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-300/15 text-emerald-200">
              <HeartPulse size={20} aria-hidden />
            </button>
            <div className="min-w-0">
              <p className="font-medium">Tempo 3×10 min</p>
              <p className="text-sm text-white/55">Tomorrow · 55 min</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-3 py-1 text-sm text-emerald-100">👏 12</span>
            <span className="rounded-xl bg-emerald-300 px-3 py-1.5 text-sm font-medium text-black">Send</span>
            <span className="text-sm text-emerald-200">View plan</span>
          </div>
        </div>
        {hint && <p className="mt-2 text-xs text-white/50">{hint}</p>}
      </div>

      <Group title="Color">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {THEMES.filter((t) => ("store" in t ? owned.includes(t.id) : !("hidden" in t) || (t.id === "blocks" ? found : icarus))).map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={theme === t.id}
              onClick={() => pickTheme(t.id)}
              className={`flex min-h-12 min-w-0 items-center gap-3 rounded-2xl border px-3 text-sm ${theme === t.id ? "border-white/40 bg-white/[0.08]" : "border-white/10 bg-white/[0.04] text-white/70"}`}
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full ring-1 ring-white/20"
                style={{ background: t.id === "custom" && theme === "custom" ? `oklch(83.5% 0.13 ${look.hue})` : t.swatch }}
                aria-hidden
              />
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>
        {theme === "custom" && (
          <label className="mt-3 block">
            <span className="sr-only">Custom color</span>
            <input
              type="range"
              min={0}
              max={359}
              value={look.hue}
              onChange={(e) => set({ hue: Number(e.target.value) })}
              className="hue-slider h-10 w-full cursor-pointer appearance-none rounded-full bg-transparent"
              style={{ background: "linear-gradient(90deg, oklch(83.5% 0.13 0), oklch(83.5% 0.13 60), oklch(83.5% 0.13 120), oklch(83.5% 0.13 180), oklch(83.5% 0.13 240), oklch(83.5% 0.13 300), oklch(83.5% 0.13 359))" }}
            />
            <span className="mt-1 block text-xs text-white/50">Slide to pick any color.</span>
          </label>
        )}
        <p className="mt-2 text-xs text-white/45">Readiness colors (green, yellow, red) stay the same in every theme. More themes are in the Grit store.</p>
      </Group>

      <Group title="Background">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={look.bg === b.id}
              onClick={() => set({ bg: b.id })}
              className={`flex min-h-14 min-w-0 flex-col items-start justify-center rounded-2xl border px-3 py-2 text-left ${look.bg === b.id ? "border-white/40 bg-white/[0.08]" : "border-white/10 bg-white/[0.04] text-white/70"}`}
            >
              <span className="flex items-center gap-2 text-sm">
                <span className="h-4 w-4 shrink-0 rounded-md ring-1 ring-white/25" style={{ background: b.swatch || "var(--color-emerald-950)" }} aria-hidden />
                {b.label}
              </span>
              <span className="text-[11px] text-white/45">{b.hint}</span>
            </button>
          ))}
        </div>
        <div className="mt-2">
          <Switch on={look.glow} onChange={(glow) => set({ glow })} label="Background glow" hint="The soft light at the top of each page" />
        </div>
      </Group>

      <Group title="Text size">
        <Segmented label="Text size" value={look.text} options={TEXT_SIZES.map((t) => ({ id: t.id, label: t.id === "xl" ? "XL" : t.id === "l" ? "Large" : t.label }))} onChange={(text) => set({ text })} />
      </Group>

      <Group title="Corners">
        <Segmented label="Corners" value={look.corners} options={CORNERS} onChange={(corners) => set({ corners })} />
      </Group>

      <Group title="Spacing">
        <Segmented label="Spacing" value={look.density} options={DENSITIES} onChange={(density) => set({ density })} />
      </Group>

      <Switch on={look.motion} onChange={(motion) => set({ motion })} label="Animations" hint="Turn off for a calmer, still app" />

      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-xs text-white/45" aria-live="polite">
          {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved to your account" : saved === "error" ? "Couldn't save. Try again." : "Changes save on their own."}
        </span>
        {!isDefault && (
          <button type="button" onClick={reset} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-white/60 hover:text-white">
            <RotateCcw size={14} aria-hidden /> Reset
          </button>
        )}
      </div>
    </div>
  );
}

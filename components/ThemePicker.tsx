"use client";

import { HeartPulse } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { setTheme } from "@/lib/theme-actions";
import { THEME_COOKIE, THEMES, type ThemeId } from "@/lib/themes";

const SECRET_TAPS = 7;

/** Color theme picker. One theme is hidden until you find it. */
export default function ThemePicker({ initial }: { initial: ThemeId }) {
  const [theme, setLocal] = useState<ThemeId>(initial);
  const [found, setFound] = useState(initial === "blocks");
  const [hint, setHint] = useState<string | null>(null);
  const taps = useRef(0);
  const [, start] = useTransition();

  // Paint the chosen theme now. Also brings this account's theme to a new device.
  useEffect(() => {
    const el = document.documentElement;
    if (el.dataset.theme === theme) return;
    el.dataset.theme = theme;
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
  }, [theme]);

  const pick = (id: ThemeId) => {
    setLocal(id);
    start(async () => void (await setTheme(id)));
  };

  const tap = () => {
    if (found) return;
    taps.current += 1;
    const left = SECRET_TAPS - taps.current;
    if (left <= 0) {
      setFound(true);
      setHint("You found Blocks.");
    } else if (left <= 3) setHint(`${left} more…`);
  };

  return (
    <div>
      <button type="button" onClick={tap} aria-label="Diastole" className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-300/15 text-emerald-200">
        <HeartPulse size={20} aria-hidden />
      </button>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {THEMES.filter((t) => !("hidden" in t) || found).map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={theme === t.id}
            onClick={() => pick(t.id)}
            className={`flex min-h-12 items-center gap-3 rounded-2xl border px-4 text-sm ${theme === t.id ? "border-white/40 bg-white/[0.08]" : "border-white/10 bg-white/[0.04] text-white/70"}`}
          >
            <span className="h-5 w-5 shrink-0 rounded-full ring-1 ring-white/20" style={{ background: t.swatch }} aria-hidden />
            {t.label}
          </button>
        ))}
      </div>
      {hint && <p className="mt-2 text-xs text-white/50">{hint}</p>}
    </div>
  );
}

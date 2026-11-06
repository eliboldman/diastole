"use client";

import { useState, useTransition } from "react";

import { setNotifyPrefs, setPushSound, type NotifyPrefs } from "@/lib/activity/actions";
import { asSound, SOUNDS, type PushGroup, type SoundId } from "@/lib/push/sounds";

const GROUPS: { id: keyof NotifyPrefs; label: string; coach?: boolean }[] = [
  { id: "messages", label: "Messages" },
  { id: "comments", label: "Comments on your workouts" },
  { id: "props", label: "Props and kudos" },
  { id: "workouts", label: "New and changed workouts" },
  { id: "pods", label: "Pod invites and replies" },
  { id: "coaching", label: "Coaching alerts (suggestions, form, new athletes)", coach: true },
];

/** Which notifications reach the bell and your phone, and the sound each plays in the iPhone app. */
export default function NotifySettings({ initial, coach, sounds: initialSounds = {} }: { initial: NotifyPrefs; coach: boolean; sounds?: Record<string, unknown> }) {
  const [prefs, setPrefs] = useState(initial);
  const [sounds, setSounds] = useState(initialSounds);
  const pickSound = (group: PushGroup, sound: SoundId) => {
    const before = sounds;
    setSounds({ ...sounds, [group]: sound });
    // Preview it (the app plays the same sound on the lock screen).
    if (sound !== "none" && sound !== "default") {
      try {
        void new Audio(`/sounds/${sound}.m4a`).play().catch(() => {});
      } catch {}
    }
    start(async () => {
      try {
        await setPushSound(group, sound);
      } catch {
        setSounds(before);
      }
    });
  };
  const [pending, start] = useTransition();
  const flip = (id: keyof NotifyPrefs) => {
    const next = { ...prefs, [id]: prefs[id] === false };
    setPrefs(next);
    navigator.vibrate?.(5);
    start(async () => {
      try {
        await setNotifyPrefs(next);
      } catch {
        setPrefs(prefs);
      }
    });
  };
  return (
    <ul className="grid gap-2">
      {GROUPS.filter((g) => !g.coach || coach).map((g) => {
        const on = prefs[g.id] !== false;
        return (
          <li key={g.id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="min-w-0 flex-1 text-sm text-white/80">
              {g.label}
              {on && (
                <label className="mt-1 flex items-center gap-2 text-xs text-white/45">
                  <span>Sound</span>
                  <select
                    value={asSound(sounds[g.id], g.id as PushGroup)}
                    onChange={(e) => pickSound(g.id as PushGroup, e.target.value as SoundId)}
                    disabled={pending}
                    className="min-h-9 rounded-xl border border-white/10 bg-white/[0.06] px-2 text-[16px] text-white/80 sm:text-xs"
                    aria-label={`Sound for ${g.label}`}
                  >
                    {SOUNDS.map((x) => (
                      <option key={x.id} value={x.id} className="bg-panel">
                        {x.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={g.label}
              disabled={pending}
              onClick={() => flip(g.id)}
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition active:scale-95 ${on ? "border-emerald-300/40 bg-emerald-300/30" : "border-white/15 bg-white/[0.08]"} disabled:opacity-60`}
            >
              <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-7" : "translate-x-1"}`} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

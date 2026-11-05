"use client";

import { useState, useTransition } from "react";

import { setNotifyPrefs, type NotifyPrefs } from "@/lib/activity/actions";

const GROUPS: { id: keyof NotifyPrefs; label: string; coach?: boolean }[] = [
  { id: "messages", label: "Messages" },
  { id: "comments", label: "Comments on your workouts" },
  { id: "props", label: "Props and kudos" },
  { id: "workouts", label: "New and changed workouts" },
  { id: "pods", label: "Pod invites and replies" },
  { id: "coaching", label: "Coaching alerts (suggestions, form, new athletes)", coach: true },
];

/** Which notifications reach the bell (and later, your phone). The database skips the ones turned off. */
export default function NotifySettings({ initial, coach }: { initial: NotifyPrefs; coach: boolean }) {
  const [prefs, setPrefs] = useState(initial);
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
          <li key={g.id} className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm text-white/80">{g.label}</span>
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

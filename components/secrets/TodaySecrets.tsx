"use client";

import { useEffect } from "react";

import { checkNightShift } from "@/lib/secrets-actions";
import { celebrateSecret, eggState } from "@/lib/secrets-client";

const NIGHT_TIERS = ["", "Night Shift", "Night Shift: Nocturnal", "Night Shift: Creature of the Night"];

/**
 * Runs quietly on Today: remembers today's resting heart rate for the logo's beat, and checks for
 * Night Shift sessions (a starry sky for the day, plus the badge and its tiers).
 */
export default function TodaySecrets({ restingHr }: { restingHr: number | null }) {
  useEffect(() => {
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 0);
    const expires = `expires=${endOfDay.toUTCString()}; path=/; samesite=lax`;
    if (restingHr && restingHr >= 30 && restingHr <= 120) {
      document.cookie = `d_rhr=${Math.round(restingHr)}; ${expires}`;
      document.documentElement.style.setProperty("--beat", `${(60 / restingHr).toFixed(2)}s`);
    }
    void checkNightShift()
      .then((r) => {
        const eggs = eggState();
        if (!eggs.on) return;
        if (r.nightToday) {
          document.cookie = `d_night=1; ${expires}`;
          document.documentElement.dataset.night = "on";
        }
        if (r.isNew) celebrateSecret({ emoji: "🌙", title: "Secret found: Night Shift", detail: "A starry sky for the rest of the day." });
        else if (r.tierUp) celebrateSecret({ emoji: "🌙", title: `${NIGHT_TIERS[r.tierUp]} unlocked`, detail: `${r.count} night sessions and counting.` });
      })
      .catch(() => {});
  }, [restingHr]);
  return null;
}

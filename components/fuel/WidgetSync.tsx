"use client";

import { useEffect } from "react";

export type FuelSnapshot = {
  date: string; // athlete's local date, YYYY-MM-DD
  level: "low" | "medium" | "high";
  mode: "full" | "plates" | "workout";
  meals: number;
  // Numbers only for athletes who see numbers (full mode), and only once targets exist.
  carbs: { eaten: number; low: number; high: number } | null;
  protein: { eaten: number; low: number; high: number } | null;
  kcal: { eaten: number; low: number; high: number } | null;
};

/** Inside the iPhone app: hand today's fuel to the home-screen widget. Re-sent whenever the day changes (e.g. after logging). */
export default function WidgetSync({ snapshot }: { snapshot: FuelSnapshot }) {
  const key = JSON.stringify(snapshot);
  useEffect(() => {
    const bridge = (window as unknown as { webkit?: { messageHandlers?: { diastole?: { postMessage: (m: unknown) => void } } } }).webkit?.messageHandlers?.diastole;
    bridge?.postMessage({ type: "fuelToday", snapshot: JSON.parse(key) });
  }, [key]);
  return null;
}

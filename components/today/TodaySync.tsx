"use client";

import { useEffect } from "react";

export type TodaySnapshot = {
  date: string;
  readiness: "green" | "yellow" | "red" | "unknown";
  note: string | null;
  workout: { title: string; sport: string; time: string | null; lines: string[]; mystery: boolean } | null;
  next: { date: string; title: string; sport: string }[];
};

/** Inside the iPhone app: hand today's plan to the Today widget and the offline screen. */
export default function TodaySync({ snapshot }: { snapshot: TodaySnapshot }) {
  const key = JSON.stringify(snapshot);
  useEffect(() => {
    const bridge = (window as unknown as { webkit?: { messageHandlers?: { diastole?: { postMessage: (m: unknown) => void } } } }).webkit?.messageHandlers?.diastole;
    bridge?.postMessage({ type: "todayShare", snapshot: JSON.parse(key) });
  }, [key]);
  return null;
}

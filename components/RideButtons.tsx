"use client";

import { Bike, Tv } from "lucide-react";
import { useSyncExternalStore } from "react";

// "Ride on your trainer": opens the native ride screen in the iPhone/iPad app (Bluetooth trainer
// control). On the website it only mentions the apps.

type Bridge = { webkit?: { messageHandlers?: { diastole?: { postMessage: (m: unknown) => void } } } };
const bridge = () => (window as unknown as Bridge).webkit?.messageHandlers?.diastole;
const noop = () => () => {};

export default function RideButtons({ workoutId, hub = false, quietOnWeb = false }: { workoutId?: string; hub?: boolean; quietOnWeb?: boolean }) {
  // null while server rendering, then whether we're inside the iPhone/iPad app.
  const inApp = useSyncExternalStore(
    noop,
    () => Boolean(bridge()) && document.documentElement.dataset.app === "ios",
    () => null,
  );
  if (inApp === null) return null;
  if (!inApp) {
    if (quietOnWeb) return null;
    return <p className="mt-4 text-sm text-white/45">Ride this on your smart trainer with the Diastole iPhone, iPad or Apple TV app.</p>;
  }
  return (
    <div className="mt-5 flex min-w-0 flex-wrap gap-3">
      <button
        type="button"
        onClick={() => bridge()?.postMessage({ type: "startRide", id: workoutId ?? null })}
        className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-300/25 active:scale-95"
      >
        <Bike className="size-4" aria-hidden />
        {workoutId ? "Ride on your trainer" : "Ride"}
      </button>
      {hub && (
        <button
          type="button"
          onClick={() => bridge()?.postMessage({ type: "openHub" })}
          className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 text-sm text-white/75 transition hover:bg-white/10 active:scale-95"
        >
          <Tv className="size-4" aria-hidden />
          Use iPhone as hub for Apple TV
        </button>
      )}
    </div>
  );
}

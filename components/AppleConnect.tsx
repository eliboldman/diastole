"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { disconnectApple } from "@/lib/apple/actions";

type Bridge = { webkit?: { messageHandlers?: { diastole?: { postMessage: (m: unknown) => void } } } };
const bridge = () => (window as unknown as Bridge).webkit?.messageHandlers?.diastole;

const ERRORS: Record<string, string> = {
  denied: "Health access wasn't allowed. Open the iPhone Settings app → Health → Data Access & Devices → Diastole, and turn everything on.",
  unavailable: "Apple Health isn't available on this device.",
  garmin: "You have Garmin connected. Disconnect it first: Diastole follows one watch.",
  failed: "Couldn't reach Diastole. Check your connection and try again.",
};

/** The Apple Watch card's buttons. Connecting happens in the iPhone app, which owns Apple Health access. */
export default function AppleConnect({ connected, garmin }: { connected: boolean; garmin: boolean }) {
  const router = useRouter();
  const [inApp, setInApp] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => setInApp(document.documentElement.dataset.app === "ios" && Boolean(bridge())), 0);
    const onResult = (e: Event) => {
      const d = (e as CustomEvent<{ ok: boolean; error?: string; workouts?: number }>).detail;
      setBusy(false);
      if (d?.ok) {
        setNote({ ok: true, text: `Synced.${d.workouts ? ` ${d.workouts} workout${d.workouts === 1 ? "" : "s"} on your Apple Watch.` : ""}` });
        router.refresh();
      } else setNote({ ok: false, text: ERRORS[d?.error ?? "failed"] ?? ERRORS.failed });
    };
    window.addEventListener("diastole:health", onResult);
    return () => {
      clearTimeout(t);
      window.removeEventListener("diastole:health", onResult);
    };
  }, [router]);

  const ask = (type: "connectHealth" | "syncHealth") => {
    setNote(null);
    setBusy(true);
    bridge()?.postMessage({ type });
  };

  const button =
    "inline-flex min-h-12 items-center rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 text-sm font-medium text-emerald-50 transition active:scale-95 hover:bg-emerald-300/25 disabled:opacity-50";
  const status = note && <p className={`mt-3 text-sm ${note.ok ? "text-emerald-200" : "text-red-200"}`}>{note.text}</p>;

  if (connected)
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {inApp ? (
            <button onClick={() => ask("syncHealth")} disabled={busy} className={button}>
              {busy ? "Syncing…" : "Sync now"}
            </button>
          ) : (
            <span className="text-sm text-white/55">Syncs each time you open the Diastole iPhone app.</span>
          )}
          <button
            onClick={() => start(async () => void (await disconnectApple(), router.refresh()))}
            disabled={pending}
            className="min-h-11 text-sm text-white/55 hover:text-white/70"
          >
            Disconnect Apple Watch
          </button>
        </div>
        {status}
      </div>
    );
  if (garmin) return <p className="text-sm text-white/55">{ERRORS.garmin}</p>;
  if (inApp === false) return <p className="text-sm text-white/55">Open this page in the Diastole iPhone app to connect your Apple Watch.</p>;
  return (
    <div>
      <button onClick={() => ask("connectHealth")} disabled={busy || !inApp} className={button}>
        {busy ? "Connecting…" : "Connect Apple Watch"}
      </button>
      {status}
    </div>
  );
}

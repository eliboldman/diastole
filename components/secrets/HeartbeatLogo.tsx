"use client";

import { useEffect, useRef, useState } from "react";

import Logo from "@/components/Logo";
import SecretSparkle from "@/components/secrets/SecretSparkle";
import { eggState, findSecret } from "@/lib/secrets-client";

/**
 * The logo, beating at today's resting heart rate (styles in globals.css). Long-press it: a bubble
 * says how fast, and the Heartbeat secret is found. A normal tap still does what it always did.
 */
export default function HeartbeatLogo({ size = 32, sparkle = false }: { size?: number; sparkle?: boolean }) {
  const [bubble, setBubble] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(() => setBubble(null), 2200);
    return () => clearTimeout(t);
  }, [bubble]);

  const start = () => {
    held.current = false;
    timer.current = setTimeout(() => {
      held.current = true;
      const rhr = Number(document.cookie.split("; ").find((c) => c.startsWith("d_rhr="))?.slice(6));
      setBubble(Number.isFinite(rhr) && rhr > 0 ? `Beating at ${Math.round(rhr)} for you today.` : "Beating along with you.");
      navigator.vibrate?.([6, 80, 6]);
      // The reward: from now on the logo beats (unless Heartbeat is switched off or set to "off").
      const eggs = eggState();
      if (eggs.on && eggs.heartbeat !== "off") document.documentElement.dataset.heartbeat = eggs.heartbeat;
      void findSecret("heartbeat");
    }, 550);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  return (
    <span
      className="relative inline-flex select-none"
      style={{ WebkitTouchCallout: "none" }}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      // A long press shouldn't also open the menu or follow the link.
      onClickCapture={(e) => {
        if (held.current) {
          e.preventDefault();
          e.stopPropagation();
          held.current = false;
        }
      }}
    >
      <span className="logo-beat inline-flex">
        <Logo size={size} />
      </span>
      {sparkle && <SecretSparkle id="heartbeat" />}
      {bubble && (
        <span role="status" className="spotlight-in absolute left-0 top-full z-50 mt-2 whitespace-nowrap rounded-xl border border-white/10 bg-panel px-3 py-2 text-xs text-white/85 shadow-xl">
          🫀 {bubble}
        </span>
      )}
    </span>
  );
}

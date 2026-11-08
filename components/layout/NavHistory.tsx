"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Counts in-app page changes this tab has made, so back buttons know there's somewhere to go back to. */
export default function NavHistory() {
  const path = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      sessionStorage.setItem("d_nav", String(Number(sessionStorage.getItem("d_nav") ?? "0") + 1));
    } catch {
      /* storage unavailable */
    }
  }, [path]);
  return null;
}

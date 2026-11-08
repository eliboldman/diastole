"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A thin bar along the top while a page loads after tapping a link. Pages render on the server,
 * so without this a slow page gives no feedback at all.
 */
export default function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start on any same-site link click that changes the page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      // Short pages finish before the bar is worth showing.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("loading"), 120);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Finish when the new page arrives.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const t = setTimeout(() => setState((s) => (s === "loading" ? "done" : "idle")), 0);
    const t2 = setTimeout(() => setState("idle"), 450);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [pathname, search]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div
        className={`h-full bg-gradient-to-r from-emerald-300/80 to-emerald-200 shadow-[0_0_12px_color-mix(in_oklab,var(--color-emerald-300)_60%,transparent)] ${
          state === "loading" ? "w-[85%] opacity-100 transition-[width] duration-[2500ms] ease-out" : state === "done" ? "w-full opacity-0 transition-all duration-300" : "w-0 opacity-0"
        }`}
      />
    </div>
  );
}

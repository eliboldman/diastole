"use client";

import { useEffect } from "react";

/**
 * Keeps your place after saving. In this Next.js version, a server action that sets a cookie or
 * revalidates (most of our saves) is applied like a navigation and scrolls the page to the top.
 * This watches for server actions (they POST with a `Next-Action` header), remembers where you
 * were, and if the same page then jumps without you scrolling, puts you back.
 * Actions that move you to another page are left alone.
 */
export default function ScrollKeeper() {
  useEffect(() => {
    const w = window as typeof window & { __dScrollKeeper?: boolean };
    if (w.__dScrollKeeper) return;
    w.__dScrollKeeper = true;

    let saved: { y: number; path: string; until: number } | null = null;
    let lastInput = 0;
    const here = () => location.pathname + location.search;
    const input = () => (lastInput = Date.now());
    for (const ev of ["wheel", "touchstart", "touchmove", "keydown", "pointerdown"]) addEventListener(ev, input, { passive: true, capture: true });

    const isAction = (init?: RequestInit) => {
      const h = init?.headers;
      if (!h) return false;
      if (h instanceof Headers) return h.has("next-action");
      if (Array.isArray(h)) return h.some(([k]) => k.toLowerCase() === "next-action");
      return Object.keys(h).some((k) => k.toLowerCase() === "next-action");
    };

    const realFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method?.toUpperCase() === "POST" && isAction(init)) {
        saved = { y: scrollY, path: here(), until: Number.POSITIVE_INFINITY };
        const p = realFetch(input, init);
        // The jump comes when the response is applied; watch a little past that.
        p.finally(() => saved && (saved.until = Date.now() + 2500));
        return p;
      }
      return realFetch(input, init);
    };

    const restore = (y: number) => {
      // The page may be briefly shorter while it re-renders; retry for a few frames.
      let tries = 0;
      const step = () => {
        if (Math.abs(scrollY - y) < 4 || tries++ > 90) return; // ~1.5 s
        scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const onScroll = () => {
      const s = saved;
      if (!s) return;
      if (Date.now() > s.until || here() !== s.path) {
        saved = null;
        return;
      }
      // The person scrolled themselves: that's their new place.
      if (Date.now() - lastInput < 400) {
        s.y = scrollY;
        return;
      }
      if (Math.abs(scrollY - s.y) > 80) restore(s.y);
    };
    addEventListener("scroll", onScroll, { passive: true });
  }, []);
  return null;
}

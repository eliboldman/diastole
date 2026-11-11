"use client";

import { useEffect } from "react";

/**
 * Keeps your place after saving.
 *
 * In this Next.js version a server action that revalidates is applied like a navigation, and the
 * router's scroll handler can then jump the page to the top (it does `documentElement.scrollTop = 0`
 * and/or `scrollIntoView()` on the page's first element). That happens while the page you're on is
 * being refreshed in place, which is never a place we want a jump.
 *
 * So while a server action or a refresh of the current URL is in flight (and briefly after it's
 * applied), those two scroll calls are ignored, as long as you're still on the same URL.
 * Real navigations to another page (or the same page with different search params) fetch a different
 * URL and scroll normally. Nothing here moves the page itself, so it never fights your own scrolling
 * (the old version restored the position afterwards, which yanked iPhone momentum scrolls back).
 */
export default function ScrollKeeper() {
  useEffect(() => {
    const w = window as typeof window & { __dScrollKeeper?: boolean };
    if (w.__dScrollKeeper) return;
    w.__dScrollKeeper = true;

    const here = () => location.pathname + location.search;
    let holdPath: string | null = null;
    let inFlight = 0;
    let holdUntil = 0;
    const holding = () => holdPath !== null && holdPath === here() && (inFlight > 0 || Date.now() < holdUntil);

    const header = (init: RequestInit | undefined, name: string) => {
      const h = init?.headers;
      if (!h) return null;
      if (h instanceof Headers) return h.get(name);
      if (Array.isArray(h)) return h.find(([k]) => k.toLowerCase() === name)?.[1] ?? null;
      const k = Object.keys(h).find((key) => key.toLowerCase() === name);
      return k ? (h as Record<string, string>)[k] : null;
    };
    /** A server action, or a router refresh of the URL we're on (not a prefetch, not another page). */
    const isInPlace = (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method?.toUpperCase() === "POST" && header(init, "next-action")) return true;
      if (!header(init, "rsc") || header(init, "next-router-prefetch")) return false;
      try {
        const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
        u.searchParams.delete("_rsc");
        return u.origin === location.origin && u.pathname + u.search === here();
      } catch {
        return false;
      }
    };

    const realFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (!isInPlace(input, init)) return realFetch(input, init);
      holdPath = here();
      inFlight++;
      return realFetch(input, init).finally(() => {
        inFlight = Math.max(0, inFlight - 1);
        // The response is applied (and the router's scroll handler runs) just after this; cover that.
        holdUntil = Date.now() + 1500;
      });
    };

    // Ignore the router's jump to the top while holding.
    const html = document.documentElement;
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
    if (desc?.get && desc.set) {
      const { get, set } = desc;
      Object.defineProperty(html, "scrollTop", {
        configurable: true,
        get() {
          return get.call(this);
        },
        set(v: number) {
          if (v === 0 && holding() && get.call(this) > 0) return;
          set.call(this, v);
        },
      });
    }
    // Backstop for the browser itself: if the page briefly gets shorter while it re-renders, iOS
    // clamps the scroll position and you land near the top. Put you back once the page is tall
    // again, but only if you haven't touched anything since the save started.
    let savedY = 0;
    let touched = false;
    let restoring = false;
    const onInput = () => {
      touched = true;
      savedY = scrollY;
    };
    for (const ev of ["touchstart", "wheel", "keydown", "pointerdown"]) addEventListener(ev, onInput, { passive: true, capture: true });
    const startHold = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (isInPlace(input, init) && inFlight === 0) {
        savedY = scrollY;
        touched = false;
      }
      return startHold(input, init);
    };
    addEventListener(
      "scroll",
      () => {
        if (restoring || touched || !holding() || savedY < 300 || scrollY > savedY - 300) return;
        restoring = true;
        let frames = 0;
        const step = () => {
          if (touched || frames++ > 60 || Math.abs(scrollY - savedY) < 4) return void (restoring = false);
          if (document.documentElement.scrollHeight - innerHeight >= savedY) scrollTo({ top: savedY, behavior: "instant" as ScrollBehavior });
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      },
      { passive: true },
    );

    const realIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (arg?: boolean | ScrollIntoViewOptions) {
      // Called with no arguments by the router; our own code passes options, and hash links still work.
      if (arg === undefined && holding() && !location.hash) return;
      return realIntoView.call(this, arg as never);
    };
  }, []);
  return null;
}

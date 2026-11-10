"use client";

// The in-app page history for this browser tab, so the back button knows whether there's a page
// to return to (and never steps out of the app). Kept in sessionStorage so it survives reloads.
// Also holds the current page's fallback ("where Back goes when opened directly"), set by BackLink.

const KEY = "d_stack";
const MAX = 50;
const listeners = new Set<() => void>();
let popped = false;
let fallback: { href: string; label: string } | null = null;

const read = (): string[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const write = (s: string[]) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s.slice(-MAX)));
  } catch {
    /* storage unavailable */
  }
};
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") addEventListener("popstate", () => (popped = true));

/** Record a page view (pathname + search). A browser back to the previous entry pops instead. */
export function recordPage(path: string) {
  const s = read();
  if (s[s.length - 1] === path) {
    popped = false;
    return;
  }
  if (popped && s[s.length - 2] === path) s.pop();
  else s.push(path);
  popped = false;
  write(s);
  emit();
}

export const canGoBack = () => read().length > 1;

export function setFallback(f: { href: string; label: string } | null) {
  fallback = f;
  emit();
}
export const getFallback = () => fallback;

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
// Snapshot for useSyncExternalStore: changes whenever depth or fallback changes.
export const snapshot = () => `${read().length > 1 ? 1 : 0}|${fallback?.href ?? ""}|${fallback?.label ?? ""}`;
export const serverSnapshot = () => "0||";

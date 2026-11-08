"use client";

import { eggsFromCookie, EGGS_COOKIE, type EggState } from "@/lib/secrets";
import { foundSecret } from "@/lib/secrets-actions";

export const SECRET_EVENT = "diastole:secret";
export type SecretMoment = { emoji: string; title: string; detail: string };

/** Show the little unlock moment (SecretToast listens). */
export const celebrateSecret = (m: SecretMoment) => window.dispatchEvent(new CustomEvent(SECRET_EVENT, { detail: m }));

/** Record a find; the first time, celebrate it. Never throws. */
export async function findSecret(id: string) {
  try {
    const r = await foundSecret(id);
    if (r.isNew && r.name) celebrateSecret({ emoji: r.emoji ?? "✨", title: `Secret found: ${r.name}`, detail: "It's in your Secrets collection now." });
  } catch {
    /* offline: try again next time */
  }
}

/** This device's egg settings and found secrets (from the cookie). */
export function eggState(): EggState {
  if (typeof document === "undefined") return eggsFromCookie(undefined);
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${EGGS_COOKIE}=`))?.slice(EGGS_COOKIE.length + 1);
  return eggsFromCookie(raw);
}

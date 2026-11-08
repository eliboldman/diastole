"use client";

import { useEffect, useState } from "react";

import { eggState } from "@/lib/secrets-client";

/**
 * A faint twinkle near something that hides a secret the person hasn't found. Off when eggs or
 * sparkles are turned off. Place it inside a `relative` parent.
 */
export default function SecretSparkle({ id, className = "-right-1 -top-1" }: { id: string; className?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      const s = eggState();
      setShow(s.on && s.sparkle && !s.found.includes(id));
    }, 0);
    return () => clearTimeout(t);
  }, [id]);
  if (!show) return null;
  return <span aria-hidden className={`secret-sparkle pointer-events-none absolute h-2 w-2 rounded-full bg-amber-100 ${className}`} />;
}

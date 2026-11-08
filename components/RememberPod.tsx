"use client";

import { useEffect } from "react";

/** Remembers the pod opened last, so the Pods tab goes straight back to it. */
export default function RememberPod({ id }: { id: string }) {
  useEffect(() => {
    document.cookie = `d_last_pod=${id}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
  }, [id]);
  return null;
}

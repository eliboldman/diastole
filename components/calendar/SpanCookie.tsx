"use client";

import { useEffect } from "react";

/** Remembers the calendar range (week, two weeks, month) picked last, so the calendar opens on it next time. */
export default function SpanCookie({ span }: { span: string | null }) {
  useEffect(() => {
    if (span) document.cookie = `cal_span=${span}; path=/; max-age=31536000; samesite=lax`;
  }, [span]);
  return null;
}

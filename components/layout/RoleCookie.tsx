"use client";

import { useEffect } from "react";

import type { NavRole } from "@/components/layout/Sidebar";

/** Remembers which navigation to show, so loading screens draw the right sidebar instantly. Not a permission. */
export default function RoleCookie({ role }: { role: NavRole }) {
  useEffect(() => {
    if (!document.cookie.includes(`d_role=${role}`)) document.cookie = `d_role=${role}; path=/; max-age=31536000; samesite=lax`;
  }, [role]);
  return null;
}

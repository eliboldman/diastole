"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { recordPage } from "@/lib/nav-stack";

/** Records each in-app page this tab visits, so back buttons know where there is to go back to. */
export default function NavHistory() {
  const path = usePathname();
  useEffect(() => {
    recordPage(location.pathname + location.search);
  }, [path]);
  return null;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { browserClient } from "@/lib/supabase/browser";

/** Keeps the inbox fresh: any new message in one of my threads (row-level security filters them) refreshes it. */
export default function InboxLive() {
  const router = useRouter();
  useEffect(() => {
    const supabase = browserClient();
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => router.refresh(), 300);
    };
    const ch = supabase
      .channel("inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, refresh)
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (t) clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(ch);
    };
  }, [router]);
  return null;
}

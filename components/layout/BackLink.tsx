"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * The one back button: top-left of every detail page, a full 44px tap target. It returns to
 * whatever page you came from in the app; opened directly (a notification, a shared link), it goes
 * to `href` instead.
 */
export default function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setCanGoBack(window.history.length > 1 && Number(sessionStorage.getItem("d_nav") ?? "0") > 0);
      } catch {
        setCanGoBack(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (!canGoBack || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        router.back();
      }}
      className="-ml-2 inline-flex min-h-11 max-w-full items-center gap-1 rounded-xl px-2 text-sm text-white/60 transition hover:bg-white/[0.05] hover:text-white"
    >
      <ChevronLeft size={16} className="shrink-0" aria-hidden />
      <span className="truncate">{canGoBack ? "Back" : label}</span>
    </Link>
  );
}

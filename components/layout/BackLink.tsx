"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { useInShell } from "@/components/layout/ShellBack";
import { setFallback, snapshot, serverSnapshot, subscribe } from "@/lib/nav-stack";

/**
 * Where Back goes from this page when it was opened directly (a notification, a shared link):
 * `href`, shown as `label`. Inside the app shell the top bar draws the one back button (and goes
 * to the previous page when there is one), so this only registers the fallback. Outside the
 * shell it draws a back button itself.
 */
export default function BackLink({ href, label }: { href: string; label: string }) {
  const inShell = useInShell();
  useEffect(() => {
    setFallback({ href, label });
    return () => setFallback(null);
  }, [href, label]);
  if (inShell) return null;
  return <BackButton className="-ml-2" />;
}

/** The back button: previous in-app page when there is one, else this page's fallback, else nothing. */
export function BackButton({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const router = useRouter();
  const snap = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [back, href, label] = snap.split("|");
  const canGoBack = back === "1";
  if (!canGoBack && !href) return null;
  const text = canGoBack ? "Back" : label || "Back";
  return (
    <Link
      href={href || "/"}
      aria-label={compact ? (canGoBack ? "Back" : `Back to ${text}`) : undefined}
      onClick={(e) => {
        if (!canGoBack || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        router.back();
      }}
      className={`inline-flex min-h-11 max-w-full items-center gap-1 rounded-xl px-2 text-sm text-white/65 transition hover:bg-white/[0.05] hover:text-white ${className}`}
    >
      <ChevronLeft size={compact ? 20 : 16} className="shrink-0" aria-hidden />
      {!compact && <span className="truncate">{text}</span>}
    </Link>
  );
}

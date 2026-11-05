"use client";

import {
  Activity,
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Lightbulb,
  MessageCircle,
  Orbit,
  PartyPopper,
  Unplug,
  UserPlus,
  Watch,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { listNotifications, markAllRead, markRead, type Notice } from "@/lib/notifications";
import { ALL_STICKERS } from "@/lib/pod-stickers";
import { browserClient } from "@/lib/supabase/browser";

const ICON: Record<string, LucideIcon> = {
  workout_sent: CalendarCheck,
  workout_updated: CalendarClock,
  workout_removed: CalendarX,
  pod_invite: Orbit,
  pod_props: PartyPopper,
  ai_suggestion: Lightbulb,
  form_insight: Activity,
  athlete_joined: UserPlus,
  pod_answer: Orbit,
  garmin_disconnected: Unplug,
  message: MessageCircle,
};

// ---------------------------------------------------------------- one shared store per tab

type State = { unread: number; items: Notice[]; loaded: boolean; open: boolean };
let state: State = { unread: 0, items: [], loaded: false, open: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const useStore = () => useSyncExternalStore(subscribe, () => state, () => state);

let refreshing: Promise<void> | null = null;
function refresh() {
  refreshing ??= listNotifications(20)
    .then(({ items, unread }) => set({ items, unread, loaded: true }))
    .catch(() => {})
    .finally(() => (refreshing = null));
  return refreshing;
}

// ---------------------------------------------------------------- pieces

export function timeAgo(iso: string, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h`;
  if (mins < 7 * 24 * 60) return `${Math.round(mins / 1440)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function stickerLine(meta: Record<string, unknown>) {
  const s = meta.stickers as Record<string, number> | undefined;
  if (!s) return null;
  return Object.entries(s)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, n]) => `${ALL_STICKERS[k]?.emoji ?? "✨"} ×${n.toLocaleString()}`)
    .join("  ");
}

/** One notification. Opening it marks it read. */
export function NoticeRow({ n, onOpen }: { n: Notice; onOpen?: () => void }) {
  const router = useRouter();
  const Icon = ICON[n.kind] ?? Watch;
  const unread = !n.read_at;
  const stickers = n.kind === "pod_props" ? stickerLine(n.meta) : null;

  const open = () => {
    if (unread) {
      set({ items: state.items.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)), unread: Math.max(0, state.unread - 1) });
      void markRead(n.id);
    }
    onOpen?.();
    if (n.href) router.push(n.href);
  };

  return (
    <button onClick={open} className={`flex min-h-14 w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/[0.06] ${unread ? "bg-white/[0.04]" : ""}`}>
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${unread ? "bg-emerald-300/15 text-emerald-200" : "bg-white/[0.05] text-white/45"}`}>
        <Icon size={16} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm leading-snug [overflow-wrap:anywhere] ${unread ? "font-medium text-white" : "text-white/75"}`}>{n.title}</span>
        {stickers && <span className="mt-0.5 block truncate text-sm">{stickers}</span>}
        {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-white/50 [overflow-wrap:anywhere]">{n.body}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
        <time dateTime={n.created_at} className="text-[11px] text-white/40" suppressHydrationWarning>
          {timeAgo(n.created_at)}
        </time>
        {unread && <span className="h-2 w-2 rounded-full bg-emerald-300" aria-label="Unread" />}
      </span>
    </button>
  );
}

/** The bell. Any number can exist (desktop + mobile bars); they share one count and one panel. */
export function NotificationButton({ className = "" }: { className?: string }) {
  const { unread, open } = useStore();
  const label = unread ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        set({ open: !state.open });
        if (!state.loaded) void refresh();
      }}
      aria-label={label}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={`relative flex h-11 w-11 items-center justify-center rounded-2xl text-white/70 transition active:scale-90 hover:bg-white/[0.08] hover:text-white ${open ? "bg-white/[0.08] text-white" : ""} ${className}`}
    >
      <Bell size={19} />
      {unread > 0 && (
        <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-300 px-1 text-[10px] font-semibold leading-none text-black" aria-hidden>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}

/**
 * Mounted once per page: keeps the unread count live (Supabase Realtime, plus a refresh when the
 * tab comes back into view) and renders the panel into <body> so blurred bars can't trap it.
 */
export default function NotificationHost() {
  const { items, unread, loaded, open } = useStore();
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    void refresh();
    const supabase = browserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      channel = supabase
        .channel(`notifications:${data.user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${data.user.id}` }, () => void refresh())
        .subscribe();
    });
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  // Close on navigation, Escape, or a click outside.
  useEffect(() => {
    const t = setTimeout(() => set({ open: false }), 0);
    return () => clearTimeout(t);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && set({ open: false });
    const onClick = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) set({ open: false });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [open]);

  if (!mounted || !open) return null;
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label="Notifications"
      className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.5rem)] z-[80] flex max-h-[min(70vh,560px)] flex-col rounded-[24px] border border-white/10 bg-panel/95 shadow-2xl backdrop-blur-2xl md:inset-x-auto md:right-6 md:top-[5.25rem] md:w-[380px]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 py-2 pl-4 pr-2">
        <h2 className="text-sm font-medium">Notifications</h2>
        {unread > 0 && (
          <button
            onClick={() => {
              set({ unread: 0, items: state.items.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })) });
              void markAllRead();
            }}
            className="min-h-11 rounded-xl px-3 text-xs text-emerald-200/90 hover:bg-white/[0.06]"
          >
            Mark all read
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!loaded ? (
          <p className="px-3 py-6 text-sm text-white/45">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-6 text-sm text-white/45">Nothing yet. Workouts, pod news and updates about your athletes show up here.</p>
        ) : (
          <ul className="grid gap-1">
            {items.map((n) => (
              <li key={n.id}>
                <NoticeRow n={n} onOpen={() => set({ open: false })} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <Link href="/notifications" onClick={() => set({ open: false })} className="flex min-h-12 items-center justify-center border-t border-white/10 text-sm text-white/70 hover:text-white">
        See all
      </Link>
    </div>,
    document.body,
  );
}

/** Lets the full page keep the shared badge in step after it marks things read. */
export function syncNotifications() {
  void refresh();
}

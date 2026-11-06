"use client";

import { ArrowLeft, BookOpen, CalendarDays, CalendarRange, ChevronDown, Dumbbell, FlaskConical, LogOut, MessageCircle, Orbit, Sun, User, Users, Utensils, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import NotificationHost, { NotificationButton } from "@/components/layout/Notifications";
import SearchHost, { SearchButton } from "@/components/layout/SearchDialog";

export type NavRole = "coach" | "athlete";
// short: bottom-tab label on phones. match: other paths that belong under this tab.
type Item = { label: string; href: string; icon: LucideIcon; short?: string; match?: RegExp };

// The five tabs (bottom bar on phones, sidebar on desktop).
const NAV: Record<NavRole, Item[]> = {
  coach: [
    { label: "Today", href: "/dashboard", icon: Sun },
    { label: "Athletes", href: "/athletes", icon: Users, match: /^\/(athlete|pods)(\/|$)|^\/activity\// },
    { label: "Endurance Lab", short: "Lab", href: "/endurance-lab", icon: FlaskConical, match: /^\/(library|workouts|calendar|lab)(\/|$)/ },
    { label: "Messages", href: "/messages", icon: MessageCircle },
    // A coach's own athlete pages (day, training, fuel) live under Me.
    { label: "Me", href: "/account", icon: User, match: /^\/(me|settings|connect|garmin-log|training|fuel)(\/|$)/ },
  ],
  athlete: [
    { label: "Today", href: "/me", icon: Sun, match: /^\/me$/ },
    { label: "Training", href: "/training", icon: Dumbbell, match: /^\/(calendar|activity)(\/|$)/ },
    { label: "Fuel", href: "/fuel", icon: Utensils },
    { label: "Messages", href: "/messages", icon: MessageCircle },
    { label: "Me", href: "/account", icon: User, match: /^\/(me\/|connect)/ },
  ],
};

// Desktop has room for one-click shortcuts below the tabs.
const SHORTCUTS: Record<NavRole, Item[]> = {
  coach: [
    { label: "Calendar", href: "/calendar", icon: CalendarRange },
    { label: "Workouts", href: "/workouts", icon: CalendarDays },
    { label: "Library", href: "/library", icon: BookOpen },
    { label: "Pods", href: "/pods", icon: Orbit },
    { label: "My day", href: "/me", icon: Sun },
    { label: "My training", href: "/training", icon: Dumbbell },
    { label: "My fuel", href: "/fuel", icon: Utensils },
  ],
  athlete: [
    { label: "Calendar", href: "/calendar", icon: CalendarRange },
    { label: "My pods", href: "/me/pods", icon: Orbit },
  ],
};

function isActive(pathname: string, item: Item) {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return item.match ? item.match.test(pathname) : false;
}

export default function Sidebar({ role = "coach" }: { role?: NavRole }) {
  const pathname = usePathname();
  const items = NAV[role];
  const shortcuts = SHORTCUTS[role];
  const home = role === "coach" ? "/dashboard" : "/me";

  const navLink = (item: Item, active: boolean) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-4 rounded-2xl border px-2 py-3 text-sm transition-all duration-500 ${
        active ? "border-white/10 bg-white/[0.06] text-white" : "border-transparent text-white/55 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <item.icon size={17} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-emerald-200" : ""} />
      </span>
      <span className="whitespace-nowrap opacity-0 transition-opacity duration-500 group-hover:opacity-100">{item.label}</span>
    </Link>
  );

  return (
    <>
      {/* Desktop: slim sidebar that expands on hover */}
      <aside className="group fixed left-6 top-6 z-50 hidden h-[calc(100vh-3rem)] w-16 overflow-hidden rounded-[32px] border border-white/10 bg-panel/60 backdrop-blur-3xl transition-all duration-700 hover:w-60 hover:shadow-[0_0_80px_rgba(255,255,255,0.06)] md:block">
        <div className="relative z-10 flex h-full flex-col p-4">
          <Link href={home} className="flex items-center gap-3">
            <Image src="/logo.png" alt="Diastole" width={32} height={32} className="shrink-0 rounded-lg" />
            <span className="whitespace-nowrap text-sm font-semibold opacity-0 transition-opacity duration-500 group-hover:opacity-100">Diastole</span>
          </Link>

          <nav aria-label="Main" className="mt-10 space-y-2">
            {items.map((item) => navLink(item, isActive(pathname, item)))}
          </nav>
          <div className="my-4 border-t border-white/[0.08]" />
          <nav aria-label="Shortcuts" className="space-y-2">
            {shortcuts.map((item) => navLink(item, pathname === item.href || pathname.startsWith(`${item.href}/`)))}
          </nav>
        </div>
      </aside>

      {/* Desktop: search and notifications top right */}
      <div className="fixed right-6 top-6 z-50 hidden items-center gap-1 rounded-2xl border border-white/10 bg-panel/60 p-1 backdrop-blur-3xl md:flex">
        <SearchButton />
        <NotificationButton />
      </div>
      <SearchHost />
      <NotificationHost />

      {/* Mobile: slim top bar. Tapping the logo slides out every page from the left. */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-canvas/80 pt-[env(safe-area-inset-top)] backdrop-blur-2xl md:hidden">
        <div className="flex h-12 items-center justify-between pl-2 pr-1">
          <MobileMenu pathname={pathname} items={items} shortcuts={shortcuts} home={home} />
          <div className="flex items-center">
            <SearchButton />
            <NotificationButton />
          </div>
        </div>
      </header>
    </>
  );
}

function MobileMenu({ pathname, items, shortcuts, home }: { pathname: string; items: Item[]; shortcuts: Item[]; home: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const router = useRouter();
  const [inApp, setInApp] = useState(false);

  // In the iPhone app (not Safari, where this swipe means "back"): swiping right from the left edge opens the menu.
  useEffect(() => {
    if (document.documentElement.dataset.app !== "ios") return;
    const t = setTimeout(() => setInApp(true), 0);
    let start: { x: number; y: number } | null = null;
    const down = (e: TouchEvent) => {
      const p = e.touches[0];
      start = e.touches.length === 1 && p.clientX <= 28 ? { x: p.clientX, y: p.clientY } : null;
    };
    const move = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = Math.abs(e.touches[0].clientY - start.y);
      if (dy > 40 && dy > dx) start = null; // a scroll, not a swipe
      else if (dx > 50 && dx > dy * 1.5) {
        start = null;
        setOpen(true);
      }
    };
    const up = () => (start = null);
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", up, { passive: true });
    return () => {
      clearTimeout(t);
      document.removeEventListener("touchstart", down);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", up);
    };
  }, []);

  // Portal target exists only in the browser; deferred so it isn't a synchronous effect update.
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);
  // Close whenever the route changes.
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);
  // While open: Escape closes, and the page behind doesn't scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const link = (item: Item, active: boolean) => (
    <Link
      key={item.href}
      href={item.href}
      tabIndex={open ? 0 : -1}
      aria-current={active ? "page" : undefined}
      onClick={() => setOpen(false)}
      className={`flex min-h-12 items-center gap-4 rounded-2xl px-4 text-[15px] transition active:scale-[0.98] ${
        active ? "bg-emerald-300/[0.12] text-white" : "text-white/70 hover:bg-white/[0.05]"
      }`}
    >
      <item.icon size={19} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-emerald-200" : ""} />
      {item.label}
    </Link>
  );

  const drawer = (
    <div className={`fixed inset-0 z-[80] md:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/55 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} onClick={() => setOpen(false)} />
      <nav
        id="mobile-menu"
        aria-label="Main"
        role="dialog"
        aria-modal="true"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          if (dx < -60 && Math.abs(dx) > Math.abs(dy)) setOpen(false); // swipe left to close
        }}
        className={`absolute inset-y-0 left-0 flex w-[min(20rem,82vw)] flex-col overflow-y-auto border-r border-white/10 bg-panel/95 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl backdrop-blur-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ transitionTimingFunction: "var(--ease-soft)" }}
      >
        <Link href={home} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} className="mb-4 flex min-h-12 items-center gap-3 px-3">
          <Image src="/logo.png" alt="" width={30} height={30} className="rounded-lg" />
          <span className="font-semibold">Diastole</span>
        </Link>
        {/* The app uses the edge swipe for this menu, so going back lives here instead. */}
        {inApp && (
          <button
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setOpen(false);
              router.back();
            }}
            className="mb-2 flex min-h-12 w-full items-center gap-4 rounded-2xl border border-white/10 px-4 text-[15px] text-white/80 transition active:scale-[0.98]"
          >
            <ArrowLeft size={19} /> Back
          </button>
        )}
        <div className="space-y-1">{items.map((item) => link(item, isActive(pathname, item)))}</div>
        {shortcuts.length > 0 && (
          <>
            <div className="mx-3 my-3 border-t border-white/[0.08]" />
            <div className="space-y-1">{shortcuts.map((item) => link(item, pathname === item.href || pathname.startsWith(`${item.href}/`)))}</div>
          </>
        )}
        <div className="mx-3 my-3 border-t border-white/[0.08]" />
        <form action="/auth/signout" method="post">
          <button tabIndex={open ? 0 : -1} className="flex min-h-12 w-full items-center gap-4 rounded-2xl px-4 text-[15px] text-white/50 hover:bg-white/[0.05]">
            <LogOut size={19} /> Sign out
          </button>
        </form>
      </nav>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center gap-2 rounded-2xl px-2 transition active:scale-95"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label="Open menu"
      >
        <Image src="/logo.png" alt="" width={26} height={26} className="rounded-md" />
        <span className="text-sm font-semibold">Diastole</span>
        <ChevronDown size={14} className={`text-white/45 transition-transform ${open ? "-rotate-90" : ""}`} aria-hidden />
      </button>
      {mounted && createPortal(drawer, document.body)}
    </>
  );
}

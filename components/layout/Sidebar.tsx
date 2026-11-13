"use client";

import { Apple, BookOpen, Gem, Sparkles, CalendarDays, CalendarRange, ChevronDown, Dumbbell, FlaskConical, LifeBuoy, LogOut, MessageCircle, Orbit, Sun, User, Users, Utensils, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { BackButton } from "@/components/layout/BackLink";
import GritPill from "@/components/grit/GritPill";
import ViewSwitch from "@/components/layout/ViewSwitch";
import { VIEW_COOKIE, type View } from "@/lib/view";
import HeartbeatLogo from "@/components/secrets/HeartbeatLogo";
import SecretToast from "@/components/secrets/SecretToast";
import { TAB_ICON } from "@/components/layout/tab-icons";
import { DEFAULT_TABS, TAB_OPTIONS } from "@/lib/tabs";
import NotificationHost, { NotificationButton } from "@/components/layout/Notifications";
import SearchHost, { SearchButton } from "@/components/layout/SearchDialog";

export type NavRole = "coach" | "athlete" | "dietitian";
// short: bottom-tab label on phones. match: other paths that belong under this tab.
type Item = { label: string; href: string; icon: LucideIcon; short?: string; match?: RegExp };

// The five tabs (bottom bar on phones, sidebar on desktop).
const NAV: Record<NavRole, Item[]> = {
  coach: [
    { label: "Today", href: "/dashboard", icon: Sun, match: /^\/digest(\/|$)/ },
    { label: "Athletes", href: "/athletes", icon: Users, match: /^\/(athlete|pods)(\/|$)|^\/activity\// },
    { label: "Endurance Lab", short: "Lab", href: "/endurance-lab", icon: FlaskConical, match: /^\/(library|workouts|calendar|lab)(\/|$)/ },
    { label: "Messages", href: "/messages", icon: MessageCircle },
    // A coach's own athlete pages (day, training, fuel) live under Me.
    { label: "Me", href: "/account", icon: User, match: /^\/(me|settings|connect|garmin-log|training|fuel|races)(\/|$)/ },
  ],
  athlete: [
    { label: "Today", href: "/me", icon: Sun, match: /^\/me$/ },
    { label: "Training", href: "/training", icon: Dumbbell, match: /^\/(calendar|activity)(\/|$)/ },
    { label: "Fuel", href: "/fuel", icon: Utensils },
    { label: "Grit bank & store", short: "Grit", href: "/me/grit", icon: Gem },
    { label: "Messages", href: "/messages", icon: MessageCircle },
    { label: "Me", href: "/account", icon: User, match: /^\/(me\/(?!pods|grit)|connect|races|profile)/ },
  ],
  // A team dietitian: every athlete's nutrition, and from there their full athlete pages.
  dietitian: [
    { label: "Nutrition", href: "/nutrition", icon: Apple, match: /^\/(athlete|activity|profile)\// },
    { label: "Messages", href: "/messages", icon: MessageCircle },
  ],
};

// Phones: a fixed bar at the bottom with each person's chosen places (Settings → Bottom tabs).
// Everything else stays in the slide-out menu (tap the logo).
const tabItems = (role: NavRole, ids: string[]): Item[] =>
  ids.flatMap((id) => {
    const t = TAB_OPTIONS[role].find((o) => o.id === id);
    return t ? [{ label: t.label, href: t.href, icon: TAB_ICON[id] ?? Sun, match: t.match ? new RegExp(t.match) : undefined }] : [];
  });

// Desktop has room for one-click shortcuts below the tabs. Anything about you (your own training,
// races, setup, connections, settings) lives under Me, so it isn't repeated here.
const SHORTCUTS: Record<NavRole, Item[]> = {
  coach: [
    { label: "Calendar", href: "/calendar", icon: CalendarRange },
    { label: "Workouts", href: "/workouts", icon: CalendarDays },
    { label: "Library", href: "/library", icon: BookOpen },
    { label: "Pods", href: "/pods", icon: Orbit },
    { label: "Team fueling", href: "/nutrition", icon: Apple },
    { label: "Ask Diastole", href: "/ask", icon: Sparkles },
    { label: "My fuel", href: "/fuel", icon: Utensils },
    { label: "Help", href: "/help", icon: LifeBuoy },
  ],
  athlete: [
    { label: "Calendar", href: "/calendar", icon: CalendarRange },
    { label: "My pods", href: "/me/pods", icon: Orbit },
    { label: "Help", href: "/help", icon: LifeBuoy },
  ],
  dietitian: [{ label: "Help", href: "/help", icon: LifeBuoy }],
};

// Coach-only pages always show the coach menu, even while a coach is in athlete view.
const COACH_PATH = /^\/(dashboard|digest|athletes|athlete|endurance-lab|library|workouts|lab|pods|ask|garmin-log|nutrition|settings|health)(\/|$)/;

function isActive(pathname: string, item: Item) {
  if (pathname === item.href) return true;
  // Athlete Today (/me) owns only /me itself; /me/... pages belong to Grit, Me or Pods.
  if (item.href !== "/me" && pathname.startsWith(`${item.href}/`)) return true;
  return item.match ? item.match.test(pathname) : false;
}

export default function Sidebar({
  role: accountRole = "coach",
  tabs = DEFAULT_TABS[accountRole],
  athleteTabs = DEFAULT_TABS.athlete,
  view: savedView = "coach",
  grit = null,
}: {
  role?: NavRole;
  tabs?: string[];
  athleteTabs?: string[];
  view?: View;
  grit?: number | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const canSwitch = accountRole === "coach";
  const [view, setView] = useState<View>(savedView);
  const [prevSaved, setPrevSaved] = useState(savedView);
  if (prevSaved !== savedView) {
    setPrevSaved(savedView);
    setView(savedView);
  }
  // A coach in athlete view gets the athlete menu everywhere except coach-only pages.
  const role: NavRole = canSwitch && view === "athlete" && !COACH_PATH.test(pathname) ? "athlete" : accountRole;
  const shownView: View = role === "athlete" ? "athlete" : "coach";
  const switchTo = (next: View) => {
    setView(next);
    document.cookie = `${VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    const target = next === "athlete" ? "/me" : "/dashboard";
    if (pathname === target) router.refresh();
    else router.push(target);
  };
  const tabBar = tabItems(role, role === accountRole ? tabs : athleteTabs);
  const items = NAV[role];
  const shortcuts = SHORTCUTS[role];
  const home = role === "coach" ? "/dashboard" : role === "dietitian" ? "/nutrition" : "/me";
  // Grit in the top bar on athlete pages (Today already has its own animated chip).
  const showGrit = role === "athlete" && grit !== null && pathname !== "/me";

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
            <HeartbeatLogo size={32} />
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
        <BackButton />
        {showGrit && <span className="px-1"><GritPill balance={grit} active={pathname.startsWith("/me/grit")} /></span>}
        {canSwitch && <ViewSwitch view={shownView} onSwitch={switchTo} />}
        <span className="relative inline-flex">
          <SearchButton />
        </span>
        <NotificationButton />
      </div>
      <SearchHost />
      <NotificationHost />
      <SecretToast />

      {/* Mobile: slim top bar. Tapping the logo slides out every page from the left. */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-canvas/80 pt-[env(safe-area-inset-top)] backdrop-blur-2xl md:hidden">
        <div className="flex h-12 items-center justify-between pl-1 pr-1">
          <div className="flex min-w-0 items-center">
            <BackButton compact className="h-11 w-11 justify-center px-0" />
            <MobileMenu pathname={pathname} items={items} shortcuts={shortcuts} home={home} brand={!canSwitch && !showGrit} />
          </div>
          <div className="flex items-center gap-1">
            {canSwitch && <ViewSwitch compact view={shownView} onSwitch={switchTo} />}
            {showGrit && <GritPill balance={grit} active={pathname.startsWith("/me/grit")} />}
            <span className="relative inline-flex">
              <SearchButton />
            </span>
            {!(role === accountRole ? tabs : athleteTabs).includes("messages") && !(canSwitch && showGrit) && (
              <Link href="/messages" aria-label="Messages" className={`flex h-11 w-11 items-center justify-center rounded-xl ${pathname.startsWith("/messages") ? "text-emerald-200" : "text-white/70"}`}>
                <MessageCircle size={19} />
              </Link>
            )}
            <NotificationButton />
          </div>
        </div>
      </header>

      {/* Mobile: the tab bar */}
      <nav aria-label="Tabs" className="tabbar fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.08] bg-canvas/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabBar.length}, minmax(0, 1fr))` }}>
          {tabBar.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition active:scale-95 ${active ? "text-emerald-200" : "text-white/55"}`}
                >
                  <item.icon size={22} strokeWidth={active ? 2.2 : 1.7} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function MobileMenu({ pathname, items, shortcuts, home, brand = true }: { pathname: string; items: Item[]; shortcuts: Item[]; home: string; brand?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  // In the iPhone app (not Safari, where this swipe means "back"): swiping right from the left edge opens the menu.
  useEffect(() => {
    if (document.documentElement.dataset.app !== "ios") return;
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
    <div
      className={`fixed inset-0 z-[80] md:hidden ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
      // Swipe left anywhere (menu or the dimmed page beside it) to close, as soon as the swipe is clear.
      onTouchStart={(e) => (touch.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null)}
      onTouchMove={(e) => {
        const t = touch.current;
        if (!t) return;
        const dx = e.touches[0].clientX - t.x;
        const dy = Math.abs(e.touches[0].clientY - t.y);
        if (dy > 40 && dy > -dx) touch.current = null; // scrolling the menu
        else if (dx < -40 && -dx > dy * 1.5) {
          touch.current = null;
          setOpen(false);
        }
      }}
      onTouchEnd={() => (touch.current = null)}
    >
      <div className={`absolute inset-0 bg-black/55 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} onClick={() => setOpen(false)} />
      <nav
        id="mobile-menu"
        aria-label="Main"
        role="dialog"
        aria-modal="true"
        className={`absolute inset-y-0 left-0 flex w-[min(20rem,82vw)] flex-col overflow-y-auto border-r border-white/10 bg-panel/95 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl backdrop-blur-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ transitionTimingFunction: "var(--ease-soft)" }}
      >
        <Link href={home} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} className="mb-4 flex min-h-12 items-center gap-3 px-3">
          <HeartbeatLogo size={30} />
          <span className="font-semibold">Diastole</span>
        </Link>
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
        <HeartbeatLogo size={26} />
        <span className={`text-sm font-semibold ${brand ? "" : "hidden min-[420px]:inline"}`}>Diastole</span>
        <ChevronDown size={14} className={`text-white/45 transition-transform ${open ? "-rotate-90" : ""}`} aria-hidden />
      </button>
      {mounted && createPortal(drawer, document.body)}
    </>
  );
}

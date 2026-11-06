"use client";

import { BookOpen, CalendarDays, CalendarRange, Dumbbell, Ellipsis, FlaskConical, LogOut, MessageCircle, Orbit, Sun, User, Users, Utensils, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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

      {/* Mobile: slim top bar + bottom tab bar in thumb reach */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-canvas/80 pt-[env(safe-area-inset-top)] backdrop-blur-2xl md:hidden">
        <div className="flex h-12 items-center justify-between pl-4 pr-1">
          <Link href={home} className="flex min-h-11 items-center gap-2">
            <Image src="/logo.png" alt="" width={26} height={26} className="rounded-md" />
            <span className="text-sm font-semibold">Diastole</span>
          </Link>
          <div className="flex items-center">
            <SearchButton />
            <NotificationButton />
          </div>
        </div>
      </header>

      <MobileTabs pathname={pathname} tabs={items.slice(0, 5)} more={items.slice(5)} />
    </>
  );
}

function MobileTabs({ pathname, tabs, more }: { pathname: string; tabs: Item[]; more: Item[] }) {
  const [open, setOpen] = useState(false);
  const moreActive = more.some((m) => isActive(pathname, m));

  // Close the sheet whenever the route changes. Deferred so it isn't a synchronous effect update.
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  const tab = (active: boolean) =>
    `flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] transition active:scale-90 ${
      active ? "text-emerald-100" : "text-white/55"
    }`;

  return (
    <>
      {more.length > 0 && open && <div className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-[2px] md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      {more.length > 0 && (
        <div
          className={`fixed inset-x-3 z-[56] rounded-[28px] border border-white/10 bg-panel/95 p-2 shadow-2xl backdrop-blur-2xl transition-all duration-300 md:hidden ${
            open ? "pointer-events-auto bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] opacity-100" : "pointer-events-none bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] opacity-0"
          }`}
          style={{ transitionTimingFunction: "var(--ease-soft)" }}
          aria-hidden={!open}
        >
          {more.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              tabIndex={open ? 0 : -1}
              className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm transition active:scale-[0.98] ${
                isActive(pathname, m) ? "bg-white/[0.08] text-white" : "text-white/75 hover:bg-white/[0.05]"
              }`}
            >
              <m.icon size={18} /> {m.label}
            </Link>
          ))}
          <form action="/auth/signout" method="post">
            <button tabIndex={open ? 0 : -1} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-sm text-white/55 hover:bg-white/[0.05]">
              <LogOut size={18} /> Sign out
            </button>
          </form>
        </div>
      )}

      <nav
        aria-label="Main"
        className="web-tabs fixed inset-x-0 bottom-0 z-[57] border-t border-white/[0.08] bg-canvas/85 px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.375rem)] backdrop-blur-2xl md:hidden"
      >
        <div className="flex">
          {tabs.map((t) => {
            const active = isActive(pathname, t);
            return (
              <Link key={t.href} href={t.href} className={tab(active)} aria-current={active ? "page" : undefined}>
                <span className={`flex h-7 w-12 items-center justify-center rounded-full transition ${active ? "bg-emerald-300/15" : ""}`}>
                  <t.icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                </span>
                <span className="max-w-full truncate">{t.short ?? t.label}</span>
              </Link>
            );
          })}
          {more.length > 0 && (
            <button onClick={() => setOpen((o) => !o)} className={tab(open || moreActive)} aria-expanded={open} aria-label="More">
              <span className={`flex h-7 w-12 items-center justify-center rounded-full transition ${open || moreActive ? "bg-emerald-300/15" : ""}`}>
                <Ellipsis size={20} />
              </span>
              More
            </button>
          )}
        </div>
      </nav>
    </>
  );
}

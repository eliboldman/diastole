"use client";

import { BookOpen, CalendarDays, CalendarRange, Ellipsis, FlaskConical, History, LogOut, Orbit, Settings, Sun, User, Users, Watch, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavRole = "coach" | "athlete";
type Item = { label: string; href: string; icon: LucideIcon };

// Desktop sidebar order. Mobile shows the first four as tabs and the rest under "More".
const NAV: Record<NavRole, Item[]> = {
  coach: [
    { label: "Today", href: "/dashboard", icon: Sun },
    { label: "Athletes", href: "/athletes", icon: Users },
    { label: "Calendar", href: "/calendar", icon: CalendarRange },
    { label: "Workouts", href: "/workouts", icon: CalendarDays },
    { label: "Library", href: "/library", icon: BookOpen },
    { label: "Pods", href: "/pods", icon: Orbit },
    { label: "My athlete view", href: "/me", icon: User },
    { label: "Test lab", href: "/lab", icon: FlaskConical },
    { label: "Settings", href: "/settings", icon: Settings },
  ],
  athlete: [
    { label: "Today", href: "/me", icon: Sun },
    { label: "Calendar", href: "/calendar", icon: CalendarRange },
    { label: "Pods", href: "/me/pods", icon: Orbit },
    { label: "Device", href: "/connect", icon: Watch },
    { label: "Import history", href: "/me/import", icon: History },
  ],
};

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname.startsWith("/athlete/");
  if (href === "/me") return pathname === "/me";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SignOut({ className }: { className: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button className={className}>Sign out</button>
    </form>
  );
}

export default function Sidebar({ role = "coach" }: { role?: NavRole }) {
  const pathname = usePathname();
  const items = NAV[role];
  const home = role === "coach" ? "/dashboard" : "/me";

  return (
    <>
      {/* Desktop: slim sidebar that expands on hover */}
      <aside className="group fixed left-6 top-6 z-50 hidden h-[calc(100vh-3rem)] w-16 overflow-hidden rounded-[32px] border border-white/10 bg-panel/60 backdrop-blur-3xl transition-all duration-700 hover:w-60 hover:shadow-[0_0_80px_rgba(255,255,255,0.06)] md:block">
        <div className="relative z-10 flex h-full flex-col p-4">
          <Link href={home} className="flex items-center gap-3">
            <Image src="/logo.png" alt="Diastole" width={32} height={32} className="shrink-0 rounded-lg" />
            <span className="whitespace-nowrap text-sm font-semibold opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              Diastole
            </span>
          </Link>

          <nav className="mt-10 space-y-3">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-4 rounded-2xl border px-2 py-3 text-sm transition-all duration-500 ${
                    active
                      ? "border-white/10 bg-white/[0.06] text-white"
                      : "border-transparent text-white/55 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? "bg-emerald-300/80 shadow-[0_0_16px_rgba(110,231,183,0.35)]" : "bg-white/30"}`}
                  />
                  <span className="whitespace-nowrap opacity-0 transition-opacity duration-500 group-hover:opacity-100">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto opacity-0 transition-opacity duration-500 group-hover:opacity-100">
            <SignOut className="w-full rounded-2xl px-3 py-2 text-left text-xs text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white" />
          </div>
        </div>
      </aside>

      {/* Mobile: slim top bar + bottom tab bar in thumb reach */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-canvas/80 pt-[env(safe-area-inset-top)] backdrop-blur-2xl md:hidden">
        <div className="flex h-12 items-center px-4">
          <Link href={home} className="flex min-h-11 items-center gap-2">
            <Image src="/logo.png" alt="" width={26} height={26} className="rounded-md" />
            <span className="text-sm font-semibold">Diastole</span>
          </Link>
        </div>
      </header>

      <MobileTabs pathname={pathname} tabs={items.slice(0, 4)} more={items.slice(4)} />
    </>
  );
}

function MobileTabs({ pathname, tabs, more }: { pathname: string; tabs: Item[]; more: Item[] }) {
  const [open, setOpen] = useState(false);
  const moreActive = more.some((m) => isActive(pathname, m.href));

  // Close the sheet whenever the route changes. Deferred so it isn't a synchronous effect update.
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  const tab = (active: boolean) =>
    `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] transition active:scale-90 ${
      active ? "text-emerald-100" : "text-white/55"
    }`;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-[2px] md:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}
      <div
        className={`fixed inset-x-3 z-[56] rounded-[28px] border border-white/10 bg-panel/95 p-2 shadow-2xl backdrop-blur-2xl transition-all duration-300 md:hidden ${
          open ? "pointer-events-auto bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] opacity-100" : "pointer-events-none bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] opacity-0"
        }`}
        style={{ transitionTimingFunction: "var(--ease-soft)" }}
        aria-hidden={!open}
      >
        {more.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            tabIndex={open ? 0 : -1}
            className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm transition active:scale-[0.98] ${
              isActive(pathname, href) ? "bg-white/[0.08] text-white" : "text-white/75 hover:bg-white/[0.05]"
            }`}
          >
            <Icon size={18} /> {label}
          </Link>
        ))}
        <form action="/auth/signout" method="post">
          <button tabIndex={open ? 0 : -1} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-sm text-white/55 hover:bg-white/[0.05]">
            <LogOut size={18} /> Sign out
          </button>
        </form>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-[57] border-t border-white/[0.08] bg-canvas/85 px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.375rem)] backdrop-blur-2xl md:hidden"
      >
        <div className="flex">
          {tabs.map(({ label, href, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link key={href} href={href} className={tab(active)} aria-current={active ? "page" : undefined}>
                <span className={`flex h-7 w-12 items-center justify-center rounded-full transition ${active ? "bg-emerald-300/15" : ""}`}>
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                </span>
                {label}
              </Link>
            );
          })}
          <button onClick={() => setOpen((o) => !o)} className={tab(open || moreActive)} aria-expanded={open} aria-label="More">
            <span className={`flex h-7 w-12 items-center justify-center rounded-full transition ${open || moreActive ? "bg-emerald-300/15" : ""}`}>
              <Ellipsis size={20} />
            </span>
            More
          </button>
        </div>
      </nav>
    </>
  );
}

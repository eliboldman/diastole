"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Today", href: "/dashboard" },
  { label: "Athletes", href: "/athletes" },
  { label: "Workouts", href: "/workouts" },
  { label: "Library", href: "/library" },
  { label: "Pods", href: "/pods" },
  { label: "Me", href: "/me" },
  { label: "Settings", href: "/settings" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname.startsWith("/athlete/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SignOut({ className }: { className: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button className={className}>Sign out</button>
    </form>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: slim sidebar that expands on hover */}
      <aside className="group fixed left-6 top-6 z-50 hidden h-[calc(100vh-3rem)] w-16 overflow-hidden rounded-[32px] border border-white/10 bg-black/40 backdrop-blur-3xl transition-all duration-700 hover:w-60 hover:shadow-[0_0_80px_rgba(255,255,255,0.06)] md:block">
        <div className="relative z-10 flex h-full flex-col p-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <Image src="/logo.png" alt="Diastole" width={32} height={32} className="shrink-0 rounded-lg" />
            <span className="whitespace-nowrap text-sm font-semibold opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              Diastole
            </span>
          </Link>

          <nav className="mt-10 space-y-3">
            {navItems.map((item) => {
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
            <SignOut className="w-full rounded-2xl px-3 py-2 text-left text-xs text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white" />
          </div>
        </div>
      </aside>

      {/* Mobile: top bar with tabs */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-neutral-950/85 backdrop-blur-2xl md:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={26} height={26} className="rounded-md" />
            <span className="text-sm font-semibold">Diastole</span>
          </Link>
          <SignOut className="text-xs text-white/40" />
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-2 pb-2 pt-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-10 shrink-0 items-center rounded-xl px-3.5 text-[13px] ${
                isActive(pathname, item.href) ? "bg-white/[0.08] text-white" : "text-white/50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}

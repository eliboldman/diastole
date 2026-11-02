"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    status: "Stable",
    tone: "green",
  },
  {
    label: "Athletes",
    href: "/athletes",
    status: "3 active",
    tone: "green",
  },
  {
    label: "Calendar",
    href: "/calendar",
    status: "Synced",
    tone: "green",
  },
  {
    label: "Interventions",
    href: "/interventions",
    status: "2 elevated",
    tone: "orange",
  },
  {
    label: "Settings",
    href: "/settings",
    status: "Ready",
    tone: "neutral",
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="group fixed left-6 top-6 z-50 h-[calc(100vh-3rem)] w-16 overflow-hidden rounded-[32px] border border-white/10 bg-black/40 backdrop-blur-3xl transition-all duration-700 hover:w-72 hover:shadow-[0_0_80px_rgba(255,255,255,0.06)]">
      <div className="absolute inset-0 rounded-[32px] border border-white/[0.04]" />

      <div className="relative z-10 flex h-full flex-col p-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full border border-emerald-300/20 bg-emerald-300/10 shadow-[0_0_24px_rgba(110,231,183,0.16)] breathe" />

          <div className="opacity-0 transition-opacity duration-500 group-hover:opacity-100">
            <p className="text-sm font-semibold text-white">
              Command
            </p>

            <p className="text-xs text-white/35">
              Physiological OS
            </p>
          </div>
        </div>

        <nav className="mt-10 space-y-3">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            const dot =
              item.tone === "green"
                ? "bg-emerald-300/80 shadow-[0_0_16px_rgba(110,231,183,0.35)]"
                : item.tone === "orange"
                  ? "bg-orange-300/80 shadow-[0_0_18px_rgba(253,186,116,0.4)]"
                  : "bg-white/35";

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-4 rounded-2xl border px-2 py-3 text-sm transition-all duration-500 ${
                  active
                    ? "border-white/10 bg-white/[0.06] text-white"
                    : "border-white/0 text-white/55 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full transition-all duration-500 ${dot}`}
                />

                <span className="min-w-0 flex-1 whitespace-nowrap opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                  {item.label}
                </span>

                <span className="whitespace-nowrap text-xs text-white/35 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                  {item.status}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto opacity-0 transition-opacity duration-500 group-hover:opacity-100">
          <p className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-xs leading-relaxed text-white/45">
            Monitoring adaptation, fatigue, and readiness.
          </p>
        </div>
      </div>
    </aside>
  );
}
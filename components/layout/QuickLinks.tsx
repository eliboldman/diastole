import Link from "next/link";
import type { ReactNode } from "react";

/** A row of one-tap shortcuts under a page title. */
export default function QuickLinks({ links }: { links: { href: string; label: string; icon?: ReactNode }[] }) {
  return (
    <nav aria-label="Shortcuts" className="mt-5 flex flex-wrap gap-2">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white/80 transition active:scale-95 hover:bg-white/[0.1]"
        >
          {l.icon}
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

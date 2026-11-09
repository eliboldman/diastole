import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export type MeRow = { href: string; icon: LucideIcon; title: string; summary?: ReactNode };

/** A grouped list of places, like iPhone Settings: one row per thing, each with a one-line summary. */
export function MeGroup({ title, rows }: { title?: string; rows: MeRow[] }) {
  if (!rows.length) return null;
  return (
    <section className="mt-6">
      {title && <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-[0.2em] text-white/45">{title}</h2>}
      <ul className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.05]">
        {rows.map((r, i) => (
          <li key={r.href} className={i ? "border-t border-white/[0.08]" : ""}>
            <Link href={r.href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-white/[0.04] active:bg-white/[0.06]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-300/12 text-emerald-200">
                <r.icon size={18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{r.title}</span>
                {r.summary ? <span className="block truncate text-sm text-white/55">{r.summary}</span> : null}
              </span>
              <ChevronRight size={18} className="shrink-0 text-white/35" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

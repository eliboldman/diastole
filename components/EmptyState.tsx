import Link from "next/link";
import type { ReactNode } from "react";

/** A friendly blank: what goes here, and the one thing to do next. */
export default function EmptyState({ emoji, title, children, href, action }: { emoji: string; title: string; children?: ReactNode; href?: string; action?: string }) {
  return (
    <div className="row-in rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-center backdrop-blur-xl">
      <p className="text-4xl" aria-hidden>
        {emoji}
      </p>
      <p className="mt-3 text-lg font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-sm text-white/55">{children}</p>}
      {href && action && (
        <Link href={href} className="mt-5 inline-flex min-h-12 items-center rounded-full bg-emerald-300 px-6 text-sm font-medium text-black transition hover:bg-emerald-200">
          {action}
        </Link>
      )}
    </div>
  );
}

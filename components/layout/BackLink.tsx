import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/** The one back link style: top-left of every detail page, a full 44px tap target. */
export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-ml-2 inline-flex min-h-11 max-w-full items-center gap-1 rounded-xl px-2 text-sm text-white/60 transition hover:bg-white/[0.05] hover:text-white">
      <ChevronLeft size={16} className="shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}

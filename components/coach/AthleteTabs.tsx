"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ATHLETE_VIEWS, SECTION_VIEW, type AthleteSection, type AthleteView } from "@/lib/athlete-views";

/** View switch for the coach's athlete page (a link per view, so it works without JavaScript). */
export default function AthleteTabs({ base, view }: { base: string; view: AthleteView }) {
  const router = useRouter();

  // A bare `#section` link from a notification or bookmark: switch to the view that has it.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const want = (SECTION_VIEW as Record<string, AthleteView>)[hash as AthleteSection];
    if (want && want !== view) {
      const q = new URLSearchParams(window.location.search);
      if (want === "overview") q.delete("view"); else q.set("view", want);
      router.replace(`${window.location.pathname}${q.size ? `?${q}` : ""}#${hash}`);
    }
  }, [view, router]);

  // Coming back to an athlete opens the view you last had open for them (this browser tab only).
  // A plain /athlete/<id> link restores it; an explicit ?view= or #section link wins.
  useEffect(() => {
    const key = `athlete-view:${base}`;
    try {
      const explicit = new URLSearchParams(window.location.search).has("view") || window.location.hash.length > 1;
      const last = sessionStorage.getItem(key);
      if (!explicit && last && last !== view && ATHLETE_VIEWS.some((x) => x.v === last)) {
        router.replace(last === "overview" ? base : `${base}?view=${last}`, { scroll: false });
        return;
      }
      sessionStorage.setItem(key, view);
    } catch {
      // storage blocked: just no memory
    }
  }, [base, view, router]);

  return (
    <nav aria-label="Athlete views" className="-mx-1 mt-5 overflow-x-auto px-1 pb-1">
      <div className="inline-flex gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-xl">
        {ATHLETE_VIEWS.map(({ v, label }) => (
          <Link
            key={v}
            href={v === "overview" ? base : `${base}?view=${v}`}
            scroll={false}
            onClick={() => {
              try {
                sessionStorage.setItem(`athlete-view:${base}`, v);
              } catch {}
            }}
            aria-current={view === v ? "page" : undefined}
            className={`flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm transition sm:px-5 ${
              view === v ? "bg-emerald-300/15 text-emerald-50 ring-1 ring-emerald-300/30" : "text-white/60 hover:text-white"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

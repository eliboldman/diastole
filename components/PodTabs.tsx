import Link from "next/link";

/** Members / Feed / Challenges switch for a pod page (a link per view, so it works without JavaScript). Members is the main view. */
export type PodView = "feed" | "members" | "challenges";

export default function PodTabs({ base, view }: { base: string; view: PodView }) {
  const tab = (v: PodView, label: string) => (
    <Link
      href={v === "members" ? base : `${base}?view=${v}`}
      aria-current={view === v ? "page" : undefined}
      className={`flex min-h-10 items-center rounded-full px-5 text-sm transition ${
        view === v ? "bg-emerald-300/15 text-emerald-50 ring-1 ring-emerald-300/30" : "text-white/60 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Pod views" className="inline-flex gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-xl">
      {tab("members", "Members")}
      {tab("feed", "Feed")}
      {tab("challenges", "Challenges")}
    </nav>
  );
}

import { ChevronRight, Tent } from "lucide-react";
import Link from "next/link";

import type { Camp, MyStatus } from "@/lib/camp/data";
import { phaseOf } from "@/lib/camp/data";

const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function CampList({ camps, base, today }: { camps: { camp: Camp; status: MyStatus }[]; base: string; today: string }) {
  if (!camps.length) return null;
  return (
    <ul className="grid gap-2">
      {camps.map(({ camp, status }) => {
        const phase = phaseOf(camp, today);
        return (
          <li key={camp.id}>
            <Link href={`${base}/camp/${camp.id}`} className="lift flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
              <Tent size={18} className="shrink-0 text-emerald-200" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{camp.title}</span>
                <span className="block text-xs text-white/50">
                  {short(camp.starts_on)}–{short(camp.ends_on)} · {phase === "upcoming" ? "coming up" : phase === "live" ? "under way" : "finished"}
                  {status === "joined" ? " · you're in" : status === "left" ? " · stepped out" : ""}
                </span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-white/40" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

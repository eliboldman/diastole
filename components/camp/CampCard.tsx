import { ChevronRight, Tent } from "lucide-react";
import Link from "next/link";

import type { Board, Camp, MyStatus } from "@/lib/camp/data";
import { campLength, dayNumber, phaseOf } from "@/lib/camp/data";

import { CampChoice } from "./CampButtons";
import { TeamGoal } from "./CampBits";

const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Today: a pod camp coming up (join it), under way (today's session, team goal), or just finished (recap). */
export default function CampCard({ camp, status, board, todays, today }: { camp: Camp; status: MyStatus; board: Board; todays: { id: string; title: string; status: string }[]; today: string }) {
  const phase = phaseOf(camp, today);
  const hub = `/me/pods/${camp.pod_id}/camp/${camp.id}`;
  if (status === "declined" && phase !== "done") return null; // they said not this time; it stays on the pod page
  const until = dayNumber(camp, today) * -1 + 1;
  return (
    <section className="rounded-[28px] border border-emerald-300/25 bg-emerald-300/[0.06] p-5">
      <Link href={hub} className="flex items-start gap-3">
        <Tent size={20} className="mt-0.5 shrink-0 text-emerald-200" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-xs uppercase tracking-[0.2em] text-emerald-200/70">
            {phase === "upcoming" ? (until <= 1 ? "Camp starts tomorrow" : `Camp starts in ${until} days`) : phase === "live" ? `Camp · day ${dayNumber(camp, today)} of ${campLength(camp)}` : "Camp recap"}
          </span>
          <span className="mt-1 block text-lg font-medium">{camp.title}</span>
          {phase === "upcoming" && (
            <span className="block text-sm text-white/60">
              {short(camp.starts_on)} to {short(camp.ends_on)}
              {camp.blurb ? ` · ${camp.blurb}` : ""}
            </span>
          )}
        </span>
        <ChevronRight size={18} className="mt-1 shrink-0 text-white/40" aria-hidden />
      </Link>
      {phase === "live" && status === "joined" && (
        <p className="mt-3 text-sm text-white/75">
          Today:{" "}
          {todays.length ? (
            todays.map((w, i) => (
              <span key={w.id}>
                {i ? ", " : ""}
                <Link href={`/training/workouts/${w.id}`} className="text-emerald-100 underline-offset-2 hover:underline">
                  {w.title}
                </Link>
                {w.status === "completed" ? " ✓" : ""}
              </span>
            ))
          ) : (
            <span className="text-white/55">rest day</span>
          )}
        </p>
      )}
      {phase !== "upcoming" && (
        <div className="mt-3">
          <TeamGoal camp={camp} board={board} />
        </div>
      )}
      {phase !== "done" && status !== "joined" && (
        <div className="mt-4">
          <CampChoice campId={camp.id} status={status} over={false} />
          <p className="mt-2 text-xs text-white/45">Joining adds the camp sessions to your calendar and watch, scaled to your zones.</p>
        </div>
      )}
    </section>
  );
}

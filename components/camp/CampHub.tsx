import { Award, Download, Megaphone } from "lucide-react";

import type { Board, Camp, MyStatus } from "@/lib/camp/data";
import { campLength, dayNumber, phaseOf, recapFor } from "@/lib/camp/data";

import { CampChoice, CampMessageForm, CancelCamp } from "./CampButtons";
import { TeamGoal, Ticks } from "./CampBits";

const card = "rounded-[28px] border border-white/10 bg-white/[0.055] p-6";
const long = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

/** The camp hub: where it stands, the coach's message, ticks, the team goal; a recap and badge when it's over. */
export default function CampHub({ camp, board, messages, today, me, coach, status, back }: { camp: Camp; board: Board; messages: { date: string; body: string }[]; today: string; me: string; coach: boolean; status: MyStatus; back: string }) {
  const phase = phaseOf(camp, today);
  const todayMsg = messages.find((m) => m.date === today) ?? (phase === "done" ? messages[0] : null);
  const earlier = messages.filter((m) => m !== todayMsg && m.date <= today);
  const recap = recapFor(board, me);
  const membersIn = board.members.filter((m) => m.in).length;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={`${card} lg:col-span-2`}>
        <p className="text-xs uppercase tracking-[0.25em] text-emerald-200/70">
          {phase === "upcoming" ? `Starts ${long(camp.starts_on)}` : phase === "live" ? `Day ${dayNumber(camp, today)} of ${campLength(camp)}` : "Finished"} · {membersIn} in
        </p>
        <h1 className="mt-2 break-words text-3xl font-medium tracking-tight">{camp.title}</h1>
        {camp.blurb && <p className="mt-2 text-white/65">{camp.blurb}</p>}
        <div className="mt-5">
          <TeamGoal camp={camp} board={board} />
        </div>
        {!coach && (
          <div className="mt-5">
            <CampChoice campId={camp.id} status={status} over={phase === "done"} />
          </div>
        )}
        {coach && phase !== "done" && (
          <div className="mt-4">
            <CancelCamp campId={camp.id} back={back} />
          </div>
        )}
      </section>

      {phase === "done" && !coach && recap.planned > 0 && (
        <section className={`${card} border-emerald-300/25 bg-emerald-300/[0.06]`}>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Award size={18} className="text-emerald-200" aria-hidden /> Your camp
          </h2>
          <p className="mt-2 text-4xl font-semibold tabular-nums">
            {recap.done}
            <span className="text-lg text-white/50"> / {recap.planned} sessions</span>
          </p>
          {recap.badge && <p className="mt-2 inline-flex rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-sm text-emerald-50">{recap.badge.label}</p>}
          <p className="mt-3 text-sm text-white/60">The team put in {board.total.toLocaleString("en-US")} {camp.goal_metric === "distance" ? "km" : camp.goal_metric} together.</p>
          <a href={`/api/camp/${camp.id}/share`} download={`${camp.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-recap.png`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 text-sm text-emerald-50">
            <Download size={15} aria-hidden /> Share image
          </a>
        </section>
      )}

      <section className={card}>
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Megaphone size={18} className="text-emerald-200" aria-hidden /> From the coach
        </h2>
        {todayMsg ? (
          <p className="mt-3 whitespace-pre-wrap text-white/85">{todayMsg.body}</p>
        ) : (
          <p className="mt-3 text-sm text-white/50">{phase === "upcoming" ? "Messages start on day one." : "Nothing today yet."}</p>
        )}
        {earlier.length > 0 && (
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm text-white/55">Earlier days ({earlier.length})</summary>
            <ul className="mt-1 space-y-3">
              {earlier.map((m) => (
                <li key={m.date} className="text-sm">
                  <span className="text-xs text-white/40">{long(m.date)}</span>
                  <p className="whitespace-pre-wrap text-white/70">{m.body}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
        {coach && (
          <div className="mt-5 border-t border-white/[0.08] pt-4">
            <CampMessageForm campId={camp.id} date={today < camp.starts_on ? camp.starts_on : today > camp.ends_on ? camp.ends_on : today} initial={messages.find((m) => m.date === today)?.body ?? ""} min={camp.starts_on} max={camp.ends_on} />
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-medium">Ticks</h2>
        <div className="mt-3">
          <Ticks camp={camp} board={board} today={today} meId={me} />
        </div>
      </section>
    </div>
  );
}

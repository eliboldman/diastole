import type { CSSProperties } from "react";

import CampfireForm from "@/components/campfire/CampfireForm";
import Spotlight from "@/components/Spotlight";
import { fireSize } from "@/lib/campfire/campfire";
import { getCampfire, type CampLog } from "@/lib/campfire/data";
import { TIPS } from "@/lib/discovery";
import { createClient } from "@/lib/supabase/server";

/** The fire (Diastole's own drawing): grows with every log; logs stack underneath. */
function Fire({ size, logs }: { size: number; logs: number }) {
  const s = 0.55 + size * 0.6;
  return (
    <svg viewBox="0 0 200 160" className="mx-auto h-40 w-full max-w-xs overflow-visible" aria-hidden>
      <defs>
        <radialGradient id="fire-glow">
          <stop offset="0" stopColor="#fbbf24" stopOpacity={0.35 + size * 0.35} />
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="120" rx={70 + size * 30} ry={40 + size * 20} fill="url(#fire-glow)" />
      <g transform={`translate(100 132) scale(${s}) translate(-100 -132)`} className="fire-flicker" style={{ transformOrigin: "100px 132px" }}>
        <path d="M100 30c22 26 38 46 30 74-5 18-20 28-30 28s-25-10-30-28c-8-28 8-48 30-74z" fill="#f97316" />
        <path d="M100 58c14 18 22 30 17 48-3 11-10 18-17 18s-14-7-17-18c-5-18 3-30 17-48z" fill="#fbbf24" />
        <path d="M100 84c7 9 10 15 8 24-1 6-5 9-8 9s-7-3-8-9c-2-9 1-15 8-24z" fill="#fef3c7" />
      </g>
      {Array.from({ length: Math.min(12, logs) }, (_, i) => {
        const row = Math.floor(i / 4);
        const x = 58 + (i % 4) * 22 + (row % 2) * 11;
        return <rect key={i} x={x} y={134 - row * 7} width="34" height="9" rx="4.5" fill={i % 2 ? "#78350f" : "#92400e"} transform={`rotate(${(i % 3) * 6 - 6} ${x + 17} ${138 - row * 7})`} />;
      })}
      {Array.from({ length: 6 }, (_, i) => (
        <circle key={i} className="ember" cx={92 + (i % 3) * 8} cy="40" r="1.6" fill="#fde68a" style={{ "--dx": `${(i - 3) * 6}px`, animationDelay: `${i * 450}ms` } as CSSProperties} />
      ))}
    </svg>
  );
}

function Media({ m }: { m: CampLog["h"] }) {
  if (!m) return null;
  return m.kind === "voice" ? (
    <audio src={m.url} controls preload="none" className="mt-1.5 h-9 w-full max-w-xs" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link
    <img src={m.url} alt="" loading="lazy" className="mt-1.5 max-h-56 w-auto rounded-xl" />
  );
}

function LogList({ logs, names }: { logs: CampLog[]; names: Record<string, string> }) {
  return (
    <ul className="mt-4 grid gap-2.5">
      {logs.map((l) => (
        <li key={l.id} className="rounded-2xl border border-amber-200/10 bg-black/20 p-3">
          <p className="text-sm font-medium text-amber-50">{l.is_coach ? `${names[l.author_id] ?? "Coach"} (coach) dropped in` : (names[l.author_id] ?? "Someone")}</p>
          {(l.highlight || l.h) && (
            <div className="mt-1.5">
              {!l.is_coach && <p className="text-[11px] uppercase tracking-wider text-amber-200/70">Highlight</p>}
              {l.highlight && <p className="text-sm text-white/85">{l.highlight}</p>}
              <Media m={l.h} />
            </div>
          )}
          {(l.struggle || l.s) && (
            <div className="mt-2">
              <p className="text-[11px] uppercase tracking-wider text-white/45">Struggle</p>
              {l.struggle && <p className="text-sm text-white/75">{l.struggle}</p>}
              <Media m={l.s} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Sunday evenings the pod page becomes a campfire. Each member can add a log (highlight + struggle);
 * the fire grows with every one. The rest of the week it's a small card with last Sunday's logs.
 */
export default async function Campfire({ podId, meId, coach, names, members, tipSeen = true }: { podId: string; meId: string; coach: boolean; names: Record<string, string>; members: number; tipSeen?: boolean }) {
  const supabase = await createClient();
  const view = await getCampfire(supabase, podId);
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: view.podTz });

  if (!view.window.open)
    return view.last ? (
      <details className="row-in mt-4 rounded-[24px] border border-amber-200/10 bg-amber-200/[0.03] px-5 py-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm">
          <span>🔥 Last Sunday&apos;s campfire · {view.last.logs.length} log{view.last.logs.length === 1 ? "" : "s"}</span>
          <span className="text-xs text-white/45">Next: {when(view.window.opensAt)}</span>
        </summary>
        <LogList logs={view.last.logs} names={names} />
      </details>
    ) : null;

  const mine = view.logs.find((l) => l.author_id === meId);
  const athletes = view.logs.filter((l) => !l.is_coach).length;
  return (
    <>
      {!tipSeen && <Spotlight tip={TIPS.campfire} seen={false} />}
      <section className="row-in campfire-night mt-4 overflow-hidden rounded-[28px] border border-amber-200/20 p-5" aria-label="Pod campfire">
        <p className="text-[11px] uppercase tracking-[0.15em] text-amber-200/80">Sunday campfire · until {when(view.window.closesAt)}</p>
        <Fire size={fireSize(athletes, members)} logs={athletes} />
        <p className="text-center text-sm text-amber-50/85">
          {athletes === 0 ? "The fire's lit. Who's first to sit down?" : `${athletes} of ${members} around the fire${athletes >= members ? ". Everyone's here!" : "."}`}
        </p>
        <CampfireForm podId={podId} meId={meId} coach={coach} initial={mine ? { highlight: mine.highlight, struggle: mine.struggle } : undefined} />
        {view.logs.length > 0 && <LogList logs={view.logs} names={names} />}
      </section>
    </>
  );
}

import Spotlight from "@/components/Spotlight";
import BatonToggle from "@/components/baton/BatonToggle";
import { HOP_H } from "@/lib/baton/baton";
import { processBaton } from "@/lib/baton/run";
import { TIPS } from "@/lib/discovery";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** A glowing relay baton (Diastole's own drawing). */
export function BatonMark({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden className="shrink-0">
      <defs>
        <radialGradient id="baton-glow">
          <stop offset="0" stopColor="var(--color-emerald-300)" stopOpacity=".55" />
          <stop offset="1" stopColor="var(--color-emerald-300)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#baton-glow)" />
      <g transform="rotate(-35 24 24)">
        <rect x="9" y="19" width="30" height="10" rx="5" fill="var(--color-emerald-300)" />
        <rect x="9" y="19" width="8" height="10" rx="4" fill="var(--color-emerald-100)" />
        <rect x="31" y="19" width="8" height="10" rx="4" fill="var(--color-emerald-400)" />
        <rect x="14" y="20.5" width="20" height="2" rx="1" fill="#fff" opacity=".5" />
      </g>
    </svg>
  );
}

const ago = (iso: string) => {
  const h = (Date.now() - Date.parse(iso)) / 3_600_000;
  return h < 1 ? "under an hour" : h < 24 ? `${Math.round(h)} h` : `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? "" : "s"}`;
};

/**
 * The pod baton: who has it, its journey, handoffs and the longest unbroken chain. Opt-in per
 * member; only shows a member's name and when they finished (never what they did).
 */
export default async function PodBaton({ podId, meId, names, tipSeen }: { podId: string; meId: string; names: Record<string, string>; tipSeen: boolean }) {
  await processBaton(createAdminClient(), podId).catch(() => null);
  const supabase = await createClient();
  const [{ data: state }, { data: passes }, { data: mine }] = await Promise.all([
    supabase.from("pod_batons").select("holder_id, since, handoffs, chain, longest").eq("pod_id", podId).maybeSingle(),
    supabase.from("baton_passes").select("id, from_id, to_id, kind, passed_at").eq("pod_id", podId).order("passed_at", { ascending: false }).limit(8),
    supabase.from("pod_members").select("baton").eq("pod_id", podId).eq("athlete_id", meId).maybeSingle(),
  ]);
  const inIt = Boolean(mine?.baton);
  const name = (id: string | null) => (id === meId ? "You" : (id && names[id]) || "Someone");
  const holder = state?.holder_id ?? null;
  const live = Boolean(state && holder);
  const now = new Date().toISOString();
  const held = state?.since ? ago(state.since) : null;
  const hopsSoon = state?.since && (Date.parse(now) - Date.parse(state.since)) / 3_600_000 > HOP_H - 12;

  return (
    <>
      {!tipSeen && <Spotlight tip={TIPS.baton} seen={false} />}
      <section className="row-in mt-4 rounded-[28px] border border-emerald-300/15 bg-gradient-to-br from-emerald-300/[0.06] to-white/[0.02] p-5" aria-label="Pod baton">
        <div className="flex items-center gap-3">
          <BatonMark size={44} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.15em] text-emerald-200/75">Pod baton</p>
            {live ? (
              <p className="text-lg font-medium">
                {holder === meId ? "You've got it" : `${name(holder)} has it`}
                <span className="text-sm font-normal text-white/50"> · {held}</span>
              </p>
            ) : (
              <p className="text-sm text-white/65">Needs two people in to start. Each workout you finish passes it to the next person.</p>
            )}
          </div>
        </div>
        {live && (
          <>
            <p className="mt-2 text-sm text-white/60">
              {holder === meId ? "Finish any workout and it's on its way. A rest day passes it on without breaking the chain." : hopsSoon ? "It hops on by itself soon. No pressure." : "It moves when they finish a workout, in any time zone."}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                ["Handoffs", state!.handoffs],
                ["Chain", state!.chain],
                ["Longest", state!.longest],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-white/[0.04] py-2">
                  <dt className="text-[11px] uppercase tracking-wider text-white/45">{k}</dt>
                  <dd className="text-xl font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            {(passes ?? []).length > 0 && (
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-2 text-sm text-emerald-200">The baton&apos;s journey</summary>
                <ol className="mt-1 grid gap-1 text-sm">
                  {(passes ?? []).map((p) => (
                    <li key={p.id} className="flex justify-between gap-3 text-white/70">
                      <span className="min-w-0 truncate">
                        {p.kind === "start" ? `Started with ${name(p.to_id)}` : p.kind === "pass" ? `${name(p.from_id)} → ${name(p.to_id)}` : p.kind === "skip" ? `${name(p.from_id)} resting, on to ${name(p.to_id)}` : `Hopped on to ${name(p.to_id)}`}
                      </span>
                      <span className="shrink-0 text-xs text-white/45">{new Date(p.passed_at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        )}
        <BatonToggle podId={podId} on={inIt} />
      </section>
    </>
  );
}

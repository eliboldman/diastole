"use client";

import { TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { applyZoneSuggestion, dismissZoneSuggestion } from "@/lib/training/zone-actions";
import { ZONE_LABEL, zoneText, type Suggestion } from "@/lib/training/zone-suggest";

export type ZoneRow = { athleteId: string; name?: string; suggestions: Suggestion[] };

/** "Walker's FTP looks like 285 W now (zones say 270)": apply in one tap, or not now. */
export default function ZoneSuggestions({ rows, units, title = true }: { rows: ZoneRow[]; units: "mi" | "km"; title?: boolean }) {
  const items = rows.flatMap((r) => r.suggestions.map((s) => ({ ...s, athleteId: r.athleteId, name: r.name })));
  if (!items.length) return null;
  return (
    <section id="zone-suggestions" className="mt-6 scroll-mt-6 rounded-[28px] border border-emerald-300/20 bg-emerald-300/[0.04] p-5">
      {title && (
        <h2 className="flex items-center gap-2 font-medium">
          <TrendingUp size={17} className="text-emerald-200" aria-hidden /> Zone updates
        </h2>
      )}
      <p className={`${title ? "mt-1 " : ""}text-sm text-white/60`}>
        {items.some((s) => s.test) ? "Tests and recent efforts say these zones are out of date (a test can lower one, too)." : "Recent efforts say these zones are out of date."} Applying one also updates upcoming workouts that aren&apos;t on the watch yet.
      </p>
      <ul className="mt-3 divide-y divide-white/[0.08]">
        {items.map((s) => (
          <Item key={`${s.athleteId}:${s.key}`} s={s} units={units} />
        ))}
      </ul>
    </section>
  );
}

function Item({ s, units }: { s: Suggestion & { athleteId: string; name?: string }; units: "mi" | "km" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  if (done) return <li className="py-3 text-sm text-emerald-100/90">{done}</li>;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium">
          {s.name && (
            <Link href={`/athlete/${s.athleteId}#zones`} className="hover:underline">
              {s.name}
            </Link>
          )}
          {s.name ? " · " : ""}
          {s.test && <span className="mr-1.5 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-100">Test</span>}
          {ZONE_LABEL[s.key]}: <span className="text-white/55">{zoneText(s.key, s.current, units)}</span> → <span className="text-emerald-100">{zoneText(s.key, s.suggested, units)}</span>
        </p>
        <p className="text-xs text-white/55">
          {s.why}
          {s.test?.thresholdHr ? ` Applying also sets threshold heart rate to ${s.test.thresholdHr} bpm.` : ""}{" "}
          <Link href={`/activity/${s.activity_id}`} className="text-emerald-200/80 hover:underline">
            See workout
          </Link>
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await dismissZoneSuggestion(s.athleteId, s.key, s.suggested, s.test ? { testActivityId: s.activity_id } : {});
              if (r.ok) {
                setDone(s.test ? `Okay. ${ZONE_LABEL[s.key]} stays as it is.` : `Okay. ${ZONE_LABEL[s.key]} won't be suggested again unless a higher number shows up.`);
                router.refresh();
              }
            })
          }
          className="min-h-11 rounded-xl px-3 text-sm text-white/60 hover:bg-white/[0.05] disabled:opacity-50"
        >
          Not now
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await applyZoneSuggestion(s.athleteId, s.key, s.suggested, s.test ? { testActivityId: s.activity_id, thresholdHr: s.test.thresholdHr } : {});
              setDone(r.ok ? `${ZONE_LABEL[s.key]} is now ${zoneText(s.key, s.suggested, units)}. ${r.message.replace(/^Saved\.\s*/, "")}`.trim() : r.message);
              if (r.ok) router.refresh();
            })
          }
          className="min-h-11 rounded-xl border border-emerald-300/25 bg-emerald-300/15 px-4 text-sm font-medium text-emerald-50 hover:bg-emerald-300/25 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Apply"}
        </button>
      </div>
    </li>
  );
}

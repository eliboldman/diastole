import { Check, Video } from "lucide-react";

import { MOVES, SCREEN_CLIPS } from "@/lib/recovery/catalog";
import { TESTS } from "@/lib/mobility/screen";

/** What the coach still needs to film: every move and screen test without a clip, with the filename to use. */
export default function ShotList({ have }: { have: string[] }) {
  const got = new Set(have);
  const rows = [
    ...SCREEN_CLIPS.map((c) => {
      const t = TESTS.find((x) => x.clip === c.slug)!;
      return { slug: c.slug, name: c.name, note: t.how.join(" "), oneSide: t.sided, group: "Mobility screen" };
    }),
    ...MOVES.filter((m) => !m.pattern).map((m) => ({ slug: m.slug, name: m.name, note: m.cue, oneSide: m.perSide, group: m.slug.startsWith("mobility-") || m.slug.startsWith("balance-") ? "Mobility moves" : "Recovery moves" })),
  ];
  const todo = rows.filter((r) => !got.has(r.slug));
  const groups = ["Mobility screen", "Mobility moves", "Recovery moves"];
  return (
    <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-lg font-medium">Clips to film</h2>
      <p className="mt-1 text-sm text-white/55">{`${rows.length - todo.length} of ${rows.length} done.`} Landscape, whole body in frame, 10–20 seconds, plain background. For one-side moves, film the left side only; the app mirrors it for the right. Name each file as shown (or close to it) and send me the folder.</p>
      {groups.map((g) => {
        const list = rows.filter((r) => r.group === g);
        const left = list.filter((r) => !got.has(r.slug)).length;
        return (
          <details key={g} className="group mt-4" open={g !== "Recovery moves" && left > 0}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium">
              {g}
              <span className="text-xs font-normal text-white/50">{left ? `${left} to film` : "All filmed"}</span>
            </summary>
            <ul className="mt-1 divide-y divide-white/[0.06]">
              {list.map((r) => (
                <li key={r.slug} className="flex gap-3 py-3">
                  {got.has(r.slug) ? <Check size={16} className="mt-0.5 shrink-0 text-emerald-300" aria-label="filmed" /> : <Video size={16} className="mt-0.5 shrink-0 text-white/40" aria-hidden />}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {r.name}
                      {r.oneSide && <span className="ml-2 text-xs font-normal text-white/45">left side only</span>}
                    </span>
                    {!got.has(r.slug) && (
                      <>
                        <span className="mt-0.5 block text-xs text-white/55">{r.note}</span>
                        <code className="mt-1 inline-block rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-emerald-100/80">{`${r.slug}.mov`}</code>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </section>
  );
}

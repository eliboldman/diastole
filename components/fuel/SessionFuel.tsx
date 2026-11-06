import { sessionFueling, type FuelMode, type Session, type When } from "@/lib/fuel/plan";

const WHEN: Record<When, string> = { before: "Before", during: "During", after: "After" };

/** Before / during / after for one planned session. Numbers only in "full" mode. */
export default function SessionFuel({ session, mode, laterToday = false }: { session: Session; mode: FuelMode; laterToday?: boolean }) {
  const lines = sessionFueling(session, { laterToday });
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {lines.map((l) => (
        <div key={l.when} className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4">
          <dt className="text-[11px] uppercase tracking-[0.15em] text-emerald-100/70">{WHEN[l.when]}</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-white/85">{mode === "full" ? l.numbers : l.plain}</dd>
        </div>
      ))}
    </dl>
  );
}

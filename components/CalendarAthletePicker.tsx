"use client";

import { useRouter } from "next/navigation";

/** Coach-only: switch the calendar between everyone and one athlete. */
export default function CalendarAthletePicker({ athletes, value, month }: { athletes: { id: string; name: string }[]; value: string; month: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="Athlete"
      value={value}
      onChange={(e) => router.push(`/calendar?month=${month}${e.target.value ? `&athlete=${e.target.value}` : ""}`, { scroll: false })}
      className="min-h-12 w-full rounded-2xl border border-white/10 bg-panel px-3 text-base sm:w-72 sm:text-sm"
    >
      <option value="">All athletes</option>
      {athletes.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

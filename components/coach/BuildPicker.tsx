"use client";

import { Bike, Footprints, Waves } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const SPORTS = [
  { key: "run", label: "Run", Icon: Footprints },
  { key: "bike", label: "Bike", Icon: Bike },
  { key: "swim", label: "Swim", Icon: Waves },
] as const;

/** Two taps to the workout builder: pick a sport, then an athlete. */
export default function BuildPicker({ athletes }: { athletes: { id: string; name: string }[] }) {
  const [sport, setSport] = useState<(typeof SPORTS)[number]["key"]>("run");
  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label="Sport" className="grid grid-cols-3 gap-2">
        {SPORTS.map(({ key, label, Icon }) => (
          <button
            key={key}
            role="radio"
            aria-checked={sport === key}
            onClick={() => setSport(key)}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl border text-sm transition active:scale-95 ${
              sport === key ? "border-emerald-300/40 bg-emerald-300/15 text-white" : "border-white/10 text-white/60 hover:bg-white/[0.05]"
            }`}
          >
            <Icon size={17} aria-hidden /> {label}
          </button>
        ))}
      </div>
      {athletes.length === 0 ? (
        <p className="text-sm text-white/55">
          Invite an athlete first.{" "}
          <Link href="/athletes" className="text-emerald-200 hover:underline">
            Athletes →
          </Link>
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {athletes.map((a) => (
            <li key={a.id}>
              <Link
                href={`/athlete/${a.id}/workouts/new?sport=${sport}`}
                className="lift flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4"
              >
                <span className="min-w-0 truncate text-sm font-medium">{a.name}</span>
                <span className="shrink-0 text-xs text-emerald-200">Build →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

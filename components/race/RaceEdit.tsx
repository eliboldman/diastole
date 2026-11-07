"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import RaceForm, { type RaceInitial } from "@/components/race/RaceForm";
import { deleteRace } from "@/lib/fuel/race-actions";

export default function RaceEdit({ race, units, athleteId, back }: { race: RaceInitial; units: "mi" | "km"; athleteId?: string; back: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (editing) return <RaceForm initial={race} units={units} athleteId={athleteId} onDone={() => setEditing(false)} />;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={() => setEditing(true)} className="min-h-12 rounded-2xl border border-white/15 px-5 text-sm">
        Edit race
      </button>
      {confirm ? (
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteRace(race.id);
              if (r.ok) router.push(back);
            })
          }
          className="min-h-12 rounded-2xl border border-red-300/30 px-5 text-sm text-red-200"
        >
          Yes, delete it
        </button>
      ) : (
        <button onClick={() => setConfirm(true)} className="min-h-12 px-3 text-sm text-white/50 hover:text-white">
          Delete
        </button>
      )}
    </div>
  );
}

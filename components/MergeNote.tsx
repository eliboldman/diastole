"use client";

import { Merge } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { undoMerge } from "@/lib/activity/merge-actions";

/** "Merged with your Apple Watch copy · Keep both" on an activity that absorbed a duplicate. */
export default function MergeNote({ merges }: { merges: { id: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!merges.length) return null;
  return (
    <div className="mt-3 space-y-1">
      {merges.map((m) => (
        <p key={m.id} className="flex flex-wrap items-center gap-2 text-xs text-white/50">
          <Merge size={13} aria-hidden /> Merged with the {m.label} copy of this workout.
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await undoMerge(m.id);
                if (!r.ok) setError(r.error);
                router.refresh();
              })
            }
            className="min-h-8 text-emerald-200 hover:underline disabled:opacity-50"
          >
            Keep both
          </button>
        </p>
      ))}
      {error && <p className="text-xs text-amber-200">{error}</p>}
    </div>
  );
}

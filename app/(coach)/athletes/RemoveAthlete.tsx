"use client";

import { UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/coach/Toast";

import { removeAthlete } from "./actions";

export default function RemoveAthlete({ id, name, hasGarmin }: { id: string; name: string; hasGarmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { show, element } = useToast(10000);
  const first = name.split(/\s+/)[0];
  const ready = typed.trim().toLowerCase() === first.toLowerCase();

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setTyped("");
          setError(null);
        }}
        aria-label={`Remove ${name}`}
        className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-white/50 hover:bg-red-400/10 hover:text-red-200"
      >
        <UserMinus size={16} /> Remove
      </button>

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="toast-in w-full max-w-md rounded-[28px] border border-white/10 bg-panel p-6">
            <h3 className="text-lg font-medium">Remove {name}?</h3>
            <ul className="mt-3 space-y-1.5 text-sm text-white/70">
              {hasGarmin && <li>• Takes Diastole workouts off their Garmin calendar and disconnects Garmin.</li>}
              <li>• Permanently deletes their Diastole account and all their data: wellness, activities, workouts and pod memberships.</li>
              <li>• They can&apos;t sign in anymore. You can invite them again later as a new athlete.</li>
            </ul>
            <p className="mt-3 text-sm font-medium text-red-200/90">This can&apos;t be undone.</p>
            <label className="mt-5 block text-sm text-white/60">
              Type <span className="font-semibold text-white">{first}</span> to confirm
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-base text-white focus:border-red-300/40 focus:outline-none"
              />
            </label>
            {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="min-h-12 rounded-2xl px-4 text-sm text-white/60">
                Cancel
              </button>
              <button
                disabled={!ready || pending}
                onClick={() =>
                  start(async () => {
                    const r = await removeAthlete(id, typed);
                    if (!r.ok) return setError(r.error);
                    setOpen(false);
                    router.refresh();
                    show(r.message);
                  })
                }
                className="min-h-12 rounded-2xl border border-red-300/30 bg-red-300/15 px-5 text-sm font-medium text-red-50 disabled:opacity-30"
              >
                {pending ? "Removing…" : "Remove permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
      {element}
    </>
  );
}

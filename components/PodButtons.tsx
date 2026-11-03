"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createPod, deletePod, inviteToPod, removeFromPod, respondToPod, type Result } from "@/lib/pods";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : r.error);
      if (r.ok) after?.();
      router.refresh();
    });
  return { pending, error, run };
}

const btn = "min-h-11 rounded-xl border px-4 text-sm transition-colors disabled:opacity-50";
const primary = `${btn} border-emerald-300/25 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20`;
const quiet = `${btn} border-white/10 text-white/60 hover:bg-white/[0.06] hover:text-white`;
const field =
  "rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-base sm:text-sm text-white placeholder:text-white/45 focus:border-emerald-300/40 focus:outline-none";

// ---------------------------------------------------------------- coach

export function NewPodForm() {
  const { pending, error, run } = useAction();
  const [name, setName] = useState("");
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createPod(name), () => setName(""));
      }}
    >
      <input className={`${field} min-w-56 flex-1`} placeholder="Pod name, e.g. Tuesday Group" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      <button disabled={pending} className={primary}>Create pod</button>
      {error && <p className="w-full text-sm text-red-300">{error}</p>}
    </form>
  );
}

export function InviteToPod({ podId, candidates }: { podId: string; candidates: { id: string; name: string }[] }) {
  const { pending, error, run } = useAction();
  const [picked, setPicked] = useState<string[]>([]);
  if (!candidates.length) return <p className="text-sm text-white/50">Everyone on your roster is already in this pod.</p>;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {candidates.map((c) => {
          const on = picked.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked(on ? picked.filter((p) => p !== c.id) : [...picked, c.id])}
              className={`${btn} ${on ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-100" : "border-white/10 text-white/60 hover:bg-white/[0.06]"}`}
            >
              {on ? "✓ " : "+ "}
              {c.name}
            </button>
          );
        })}
      </div>
      {picked.length > 0 && (
        <button disabled={pending} className={`${primary} justify-self-start`} onClick={() => run(() => inviteToPod(podId, picked), () => setPicked([]))}>
          Invite {picked.length} athlete{picked.length > 1 ? "s" : ""}
        </button>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

export function RemoveMember({ podId, athleteId }: { podId: string; athleteId: string }) {
  const { pending, run } = useAction();
  return (
    <button disabled={pending} className="min-h-11 text-sm text-white/50 hover:text-red-300" onClick={() => run(() => removeFromPod(podId, athleteId))}>
      Remove
    </button>
  );
}

export function DeletePod({ podId, name }: { podId: string; name: string }) {
  const { pending, run } = useAction();
  return (
    <button
      disabled={pending}
      className="min-h-11 text-sm text-white/50 hover:text-red-300"
      onClick={() => confirm(`Delete the pod "${name}"? Members stop seeing each other immediately.`) && run(() => deletePod(podId))}
    >
      Delete pod
    </button>
  );
}

// ---------------------------------------------------------------- athlete

export function RespondToInvite({ podId }: { podId: string }) {
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button disabled={pending} className={primary} onClick={() => run(() => respondToPod(podId, "accept"))}>
        Accept & share
      </button>
      <button disabled={pending} className={quiet} onClick={() => run(() => respondToPod(podId, "decline"))}>
        Decline
      </button>
      {error && <p className="w-full text-sm text-red-300">{error}</p>}
    </div>
  );
}

export function LeavePod({ podId, name }: { podId: string; name: string }) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  return (
    <>
      <button
        disabled={pending}
        className={quiet}
        onClick={() =>
          confirm(`Leave "${name}"? Pod members will stop seeing your data right away.`) &&
          run(() => respondToPod(podId, "leave"), () => router.push("/me"))
        }
      >
        Leave pod
      </button>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </>
  );
}

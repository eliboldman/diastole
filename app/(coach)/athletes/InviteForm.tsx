"use client";

import { useActionState } from "react";

import { inviteAthlete, type InviteState } from "./actions";

const input =
  "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white placeholder:text-white/45 focus:border-emerald-300/40 focus:outline-none";

export default function InviteForm({ role = "athlete" }: { role?: "athlete" | "coach" | "dietitian" }) {
  const who = role === "coach" ? "Coach" : role === "dietitian" ? "Dietitian" : "Athlete";
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteAthlete, {});

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <input type="hidden" name="role" value={role} />
      <input name="full_name" placeholder={`${who} name`} aria-label={`${who} name`} className={input} />
      <input name="email" type="email" required placeholder={`${role}@email.com`} aria-label={`${who} email`} className={input} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-5 py-3 font-medium text-emerald-100 transition-colors hover:bg-emerald-300/20 disabled:opacity-50"
      >
        {pending ? "Sending…" : role === "coach" ? "Invite coach" : role === "dietitian" ? "Invite dietitian" : "Send invite"}
      </button>
      {state.ok && <p role="status" className="text-sm text-emerald-200 sm:col-span-3">{state.ok}</p>}
      {state.error && <p role="alert" className="text-sm text-red-300 sm:col-span-3">{state.error}</p>}
    </form>
  );
}

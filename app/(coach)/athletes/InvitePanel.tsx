"use client";

import { UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";

type Role = "athlete" | "coach" | "dietitian";
const ROLES: { r: Role; label: string }[] = [
  { r: "athlete", label: "Athlete" },
  { r: "coach", label: "Coach" },
  { r: "dietitian", label: "Dietitian" },
];

/**
 * One "Invite" card under the roster instead of three: pick who you're inviting, and that role's
 * form and pending invites show. Starts open when there's no one on the roster yet.
 */
export default function InvitePanel({ panels, open: startOpen = false, pending = 0 }: { panels: Record<Role, ReactNode>; open?: boolean; pending?: number }) {
  const [open, setOpen] = useState(startOpen);
  const [role, setRole] = useState<Role>("athlete");

  return (
    <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 sm:p-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 text-lg font-medium">
          <UserPlus size={18} className="text-emerald-200" aria-hidden /> Invite &amp; team
        </span>
        <span className="text-sm text-white/50">{open ? "Hide" : pending ? `${pending} pending · Open` : "Open"}</span>
      </button>
      {open && (
        <div className="mt-4">
          <div role="tablist" aria-label="Invite who" className="inline-flex gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
            {ROLES.map(({ r, label }) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={role === r}
                onClick={() => setRole(r)}
                className={`flex min-h-10 items-center rounded-full px-4 text-sm transition ${
                  role === r ? "bg-emerald-300/15 text-emerald-50 ring-1 ring-emerald-300/30" : "text-white/60 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="mt-4">
            {panels[role]}
          </div>
        </div>
      )}
    </section>
  );
}

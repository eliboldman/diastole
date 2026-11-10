"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { Eggs } from "@/lib/secrets";
import { saveEggs } from "@/lib/secrets-actions";

function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-12 w-full items-center justify-between gap-4 text-left">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-white/50">{hint}</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-emerald-300" : "bg-white/15"}`} aria-hidden>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}

/** Easter-egg settings. Saves on its own. */
export default function EggsSettings({ initial, found }: { initial: Eggs; found: string[] }) {
  const router = useRouter();
  const [e, setE] = useState(initial);
  const [, start] = useTransition();
  const set = (patch: Partial<Eggs>) => {
    const next = { ...e, ...patch };
    setE(next);
    start(async () => {
      const r = await saveEggs(patch);
      if (r.ok) {
        // Apply now on this page too.
        const root = document.documentElement;
        if (!next.on || next.heartbeat === "off" || !found.includes("heartbeat")) delete root.dataset.heartbeat;
        else root.dataset.heartbeat = next.heartbeat;
        if (!next.on) delete root.dataset.night;
        router.refresh();
      }
    });
  };
  return (
    <div className="space-y-1">
      <Switch on={e.on} onChange={(on) => set({ on })} label="Easter eggs" hint="Secrets, surprises and little celebrations. Never during a workout." />
      {e.on && (
        <>
          <Switch on={e.podPosts} onChange={(podPosts) => set({ podPosts })} label="Tell my pods" hint="Post “found a secret” in your pods (only from now on)" />
          {found.includes("heartbeat") && (
            <div className="py-2">
              <p className="text-sm">Heartbeat logo</p>
              <div className="mt-2 grid grid-cols-4 gap-1 rounded-2xl bg-white/[0.04] p-1" role="radiogroup" aria-label="Heartbeat logo">
                {(["soft", "sharp", "pixel", "off"] as const).map((h) => (
                  <button key={h} type="button" role="radio" aria-checked={e.heartbeat === h} onClick={() => set({ heartbeat: h })} className={`min-h-10 rounded-xl text-sm capitalize ${e.heartbeat === h ? "bg-white/[0.12] text-white" : "text-white/60"}`}>
                    {h === "soft" ? "Soft glow" : h === "sharp" ? "Sharp beat" : h === "pixel" ? "Pixel" : "Off"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {found.includes("night_shift") && (
            <Switch on={e.night === "keep"} onChange={(v) => set({ night: v ? "keep" : "day" })} label="Keep the starry sky" hint="Night Shift's stars every day, not just after a night session" />
          )}
        </>
      )}
      <Link href="/me/secrets" className="mt-2 inline-flex min-h-11 items-center text-sm text-emerald-200 hover:underline">
        Your Secrets collection →
      </Link>
    </div>
  );
}

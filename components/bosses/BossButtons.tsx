"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveBoss, chooseBoss, findBosses, setBossTarget, skipBoss } from "@/lib/bosses/actions";
import { BOSS, LIMITERS, type Limiter } from "@/lib/bosses/bosses";

const btn = "min-h-11 rounded-xl border px-3 text-sm transition active:scale-95 disabled:opacity-50";

/** Approve (with an optional swap) or skip one suggested boss. */
export default function BossButtons({ id, limiter }: { id: string; limiter: Limiter }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<Limiter>(limiter);
  const [err, setErr] = useState<string | null>(null);
  const run = (f: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await f();
      if (!r.ok) setErr(r.error ?? "Couldn't do that.");
      else router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label>
        <span className="sr-only">Boss</span>
        <select value={pick} onChange={(e) => setPick(e.target.value as Limiter)} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.04] px-2 text-sm text-white">
          {LIMITERS.map((l) => (
            <option key={l} value={l}>
              {BOSS[l].limiter}
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={pending} onClick={() => run(() => approveBoss(id, pick))} className={`${btn} border-emerald-300/30 bg-emerald-300/10 font-medium text-emerald-50 hover:bg-emerald-300/20`}>
        {pick === limiter ? "Approve" : "Swap & approve"}
      </button>
      <button type="button" disabled={pending} onClick={() => run(() => skipBoss(id))} className={`${btn} border-white/10 text-white/65 hover:bg-white/[0.06]`}>
        Skip
      </button>
      {err && <p role="alert" className="w-full text-xs text-red-200">{err}</p>}
    </div>
  );
}

export function FindBosses({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await findBosses();
            setMsg(r.ok ? (r.message ?? null) : r.error);
            router.refresh();
          })
        }
        className={`${btn} border-amber-200/25 bg-amber-200/[0.06] text-amber-50 hover:bg-amber-200/10`}
      >
        {pending ? "Looking…" : `Find bosses for ${count} athlete${count === 1 ? "" : "s"}`}
      </button>
      {msg && <p role="status" className="text-sm text-white/65">{msg}</p>}
    </div>
  );
}

/** Coach, on the athlete page: pick a boss by hand when none was suggested. */
export function ChooseBoss({ athleteId }: { athleteId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<Limiter>("consistency");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <select value={pick} onChange={(e) => setPick(e.target.value as Limiter)} aria-label="Boss" className="min-h-11 rounded-xl border border-white/10 bg-white/[0.04] px-2 text-sm text-white">
        {LIMITERS.map((l) => (
          <option key={l} value={l}>
            {BOSS[l].name}: {BOSS[l].limiter}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await chooseBoss(athleteId, pick);
            if (!r.ok) setErr(r.error);
            else router.refresh();
          })
        }
        className={`${btn} border-emerald-300/30 bg-emerald-300/10 text-emerald-50`}
      >
        Set this month&apos;s boss
      </button>
      {err && <p role="alert" className="w-full text-xs text-red-200">{err}</p>}
    </div>
  );
}

/** Coach: aim an upcoming session at the boss. */
export function TargetToggle({ id, on, title, date }: { id: string; on: boolean; title: string; date: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(on);
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-white/[0.04]">
      <input
        type="checkbox"
        checked={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setValue(next);
          start(async () => {
            const r = await setBossTarget(id, next);
            if (!r.ok) setValue(!next);
            else router.refresh();
          });
        }}
        className="h-5 w-5 accent-[var(--color-emerald-300)]"
      />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="text-white/50">{new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span> {title}
      </span>
    </label>
  );
}

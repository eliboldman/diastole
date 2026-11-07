"use client";

import { Plus, Trophy, Users } from "lucide-react";
import { useState, useTransition } from "react";

import { createChallenge, deleteChallenge, setChallengeEntry, type NewChallenge } from "@/lib/challenge-actions";

export type Challenge = {
  id: string;
  title: string;
  metric: "hours" | "distance" | "sessions";
  sport: "any" | "run" | "bike" | "swim";
  mode: "team" | "leaderboard";
  goal: number | null;
  starts_on: string;
  ends_on: string;
  created_by: string;
  creator: string;
  joined: boolean;
  entries: { athlete_id: string; name: string; value: number }[];
};

const KM_PER_MI = 1.609344;
const SPORT_LABEL = { any: "Any sport", run: "Running", bike: "Cycling", swim: "Swimming" } as const;
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const PRESETS: { label: string; c: Partial<NewChallenge> & { goalUnits?: number } }[] = [
  { label: "Most hours this week", c: { title: "Most hours this week", mode: "leaderboard", metric: "hours", sport: "any" } },
  { label: "Team: 50 hours", c: { title: "50 team hours", mode: "team", metric: "hours", sport: "any", goalUnits: 50 } },
  { label: "Everyone runs 3x", c: { title: "Everyone runs 3 times", mode: "leaderboard", metric: "sessions", sport: "run", goalUnits: 3 } },
  { label: "Team distance", c: { title: "Run to the next town", mode: "team", metric: "distance", sport: "run", goalUnits: 100 } },
];

/**
 * A pod's challenges: a team goal everyone builds together, or a leaderboard. Only members who
 * join are counted and shown, so nobody's totals appear unless they choose to take part.
 */
export default function PodChallenges({
  podId,
  challenges,
  meId,
  canJoin,
  isCoach,
  today,
  units,
}: {
  podId: string;
  challenges: Challenge[];
  meId: string;
  canJoin: boolean; // an active member (the coach organizes but doesn't compete)
  isCoach: boolean;
  today: string;
  units: "mi" | "km";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", mode: "leaderboard" as NewChallenge["mode"], metric: "hours" as NewChallenge["metric"], sport: "any" as NewChallenge["sport"], goal: "", startsOn: today, endsOn: plusDays(today, 6) });
  const [open, setOpen] = useState(challenges.length === 0);

  const show = (metric: Challenge["metric"], v: number) =>
    metric === "hours" ? `${v.toFixed(1).replace(/\.0$/, "")} h` : metric === "sessions" ? `${v} ${v === 1 ? "session" : "sessions"}` : `${(units === "mi" ? v / KM_PER_MI : v).toFixed(1).replace(/\.0$/, "")} ${units}`;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
    });

  const active = challenges.filter((c) => c.ends_on >= today);
  const ended = challenges.filter((c) => c.ends_on < today);

  const card = (c: Challenge) => {
    const total = c.entries.reduce((t, e) => t + Number(e.value), 0);
    const started = c.starts_on <= today;
    const over = c.ends_on < today;
    const left = Math.round((Date.parse(c.ends_on) - Date.parse(today)) / 86_400_000);
    const when = over ? `Ended ${day(c.ends_on)}` : !started ? `Starts ${day(c.starts_on)}` : left === 0 ? "Last day" : `${left} day${left === 1 ? "" : "s"} left`;
    const canDelete = isCoach || c.created_by === meId;
    const pct = c.goal ? Math.min(100, Math.round((total / Number(c.goal)) * 100)) : 0;
    return (
      <li key={c.id} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-medium">
              {c.mode === "team" ? <Users size={16} className="shrink-0 text-emerald-200" aria-hidden /> : <Trophy size={16} className="shrink-0 text-amber-200" aria-hidden />}
              <span className="min-w-0 break-words">{c.title}</span>
            </h3>
            <p className="mt-1 text-xs text-white/50">
              {c.mode === "team" ? "Team goal" : "Leaderboard"} · {SPORT_LABEL[c.sport]} · {c.metric === "distance" ? "distance" : c.metric} · {day(c.starts_on)}–{day(c.ends_on)} · {when}
            </p>
            <p className="text-xs text-white/40">Started by {c.creator}</p>
          </div>
          {canJoin && !over && (
            <button
              disabled={pending}
              onClick={() => run(() => setChallengeEntry(podId, c.id, !c.joined))}
              className={`flex min-h-11 shrink-0 items-center rounded-2xl px-4 text-sm transition active:scale-95 ${c.joined ? "border border-white/15 text-white/70 hover:bg-white/[0.06]" : "bg-emerald-300 font-medium text-black hover:bg-emerald-200"}`}
            >
              {c.joined ? "Leave" : "Join"}
            </button>
          )}
        </div>

        {c.mode === "team" && c.goal && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold tabular-nums">{show(c.metric, Math.round(total * 10) / 10)}</span>
              <span className="text-white/50">
                of {show(c.metric, Number(c.goal))} · {pct}%
              </span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.title} progress`}>
              <div className="h-full rounded-full bg-emerald-300 transition-all" style={{ width: `${pct}%` }} />
            </div>
            {pct >= 100 && <p className="mt-2 text-sm text-emerald-100">🎉 Goal reached!</p>}
          </div>
        )}

        {c.entries.length > 0 ? (
          <ol className="mt-4 space-y-1">
            {c.entries.map((e, i) => {
              const hit = c.mode === "leaderboard" && c.goal ? Number(e.value) >= Number(c.goal) : false;
              return (
                <li key={e.athlete_id} className={`flex min-h-10 items-center justify-between gap-3 rounded-xl px-3 text-sm ${e.athlete_id === meId ? "bg-emerald-300/[0.08]" : ""}`}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-6 shrink-0 text-center tabular-nums text-white/50">{c.mode === "leaderboard" && Number(e.value) > 0 && i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
                    <span className="min-w-0 truncate">{e.athlete_id === meId ? "You" : e.name}</span>
                    {hit && <span className="shrink-0 text-xs text-emerald-200">✓ done</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-white/80">{show(c.metric, Number(e.value))}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-white/50">Nobody has joined yet.</p>
        )}
        {c.mode === "leaderboard" && c.goal && <p className="mt-2 text-xs text-white/45">Personal target: {show(c.metric, Number(c.goal))}</p>}

        {canDelete && (
          <div className="mt-3 flex justify-end">
            {confirmDelete === c.id ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-white/55">Delete for everyone?</span>
                <button disabled={pending} onClick={() => run(() => deleteChallenge(podId, c.id))} className="min-h-10 rounded-xl px-3 text-red-200 hover:bg-red-400/10">
                  Delete
                </button>
                <button onClick={() => setConfirmDelete(null)} className="min-h-10 rounded-xl px-3 text-white/60 hover:bg-white/[0.06]">
                  Keep
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(c.id)} className="min-h-10 rounded-xl px-3 text-xs text-white/45 hover:bg-white/[0.06]">
                Delete
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  const field = "min-h-11 w-full min-w-0 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm";
  const goalUnit = form.metric === "hours" ? "hours" : form.metric === "sessions" ? "sessions" : units;

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-2xl border border-red-300/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-100" role="alert">
          {error}
        </p>
      )}

      {active.length > 0 && <ul className="grid gap-3 lg:grid-cols-2">{active.map(card)}</ul>}

      <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
        <button onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left font-medium" aria-expanded={open}>
          <span className="flex items-center gap-2">
            <Plus size={17} className="text-emerald-200" aria-hidden /> Start a challenge
          </span>
          <span className="text-sm text-white/45">{open ? "Close" : ""}</span>
        </button>
        {open && (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const g = Number(form.goal);
              run(async () => {
                const r = await createChallenge({
                  podId,
                  title: form.title,
                  mode: form.mode,
                  metric: form.metric,
                  sport: form.sport,
                  goal: form.goal ? (form.metric === "distance" && units === "mi" ? g * KM_PER_MI : g) : null,
                  startsOn: form.startsOn,
                  endsOn: form.endsOn,
                });
                if (r.ok) {
                  setOpen(false);
                  setForm((f) => ({ ...f, title: "", goal: "" }));
                }
                return r;
              });
            }}
          >
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      title: p.c.title ?? f.title,
                      mode: p.c.mode ?? f.mode,
                      metric: p.c.metric ?? f.metric,
                      sport: p.c.sport ?? f.sport,
                      goal: p.c.goalUnits ? String(p.c.metric === "distance" && units === "km" ? Math.round(p.c.goalUnits * KM_PER_MI) : p.c.goalUnits) : "",
                    }))
                  }
                  className="min-h-10 rounded-full border border-white/10 bg-white/[0.04] px-4 text-xs text-white/75 hover:bg-white/[0.08]"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-white/60">Name</span>
              <input className={field} value={form.title} maxLength={80} required placeholder="e.g. Rainy week warriors" onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1 block text-white/60">Type</span>
                <select className={field} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as NewChallenge["mode"] })}>
                  <option value="leaderboard">Leaderboard</option>
                  <option value="team">Team goal</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-white/60">Measure</span>
                <select className={field} value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value as NewChallenge["metric"] })}>
                  <option value="hours">Hours</option>
                  <option value="distance">Distance</option>
                  <option value="sessions">Sessions (10+ min)</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-white/60">Sport</span>
                <select className={field} value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value as NewChallenge["sport"] })}>
                  {(Object.keys(SPORT_LABEL) as (keyof typeof SPORT_LABEL)[]).map((k) => (
                    <option key={k} value={k}>
                      {SPORT_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1 block text-white/60">{form.mode === "team" ? `Team goal (${goalUnit})` : `Personal target (${goalUnit}, optional)`}</span>
                <input className={field} type="number" inputMode="decimal" min={0} step="any" required={form.mode === "team"} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-white/60">Starts</span>
                <input className={field} type="date" value={form.startsOn} required onChange={(e) => setForm({ ...form, startsOn: e.target.value, endsOn: e.target.value > form.endsOn ? plusDays(e.target.value, 6) : form.endsOn })} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-white/60">Ends</span>
                <input className={field} type="date" value={form.endsOn} min={form.startsOn} required onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
              </label>
            </div>
            <p className="text-xs text-white/45">Everyone in the pod gets a notification. Only people who join are counted, and joining shows your total to the pod for this challenge.</p>
            <button disabled={pending} className="flex min-h-12 items-center rounded-2xl bg-emerald-300 px-6 text-sm font-medium text-black transition active:scale-95 hover:bg-emerald-200 disabled:opacity-50">
              {pending ? "Starting…" : "Start challenge"}
            </button>
          </form>
        )}
      </section>

      {ended.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-white/60">Recently ended</h2>
          <ul className="grid gap-3 lg:grid-cols-2">{ended.map(card)}</ul>
        </section>
      )}
    </div>
  );
}

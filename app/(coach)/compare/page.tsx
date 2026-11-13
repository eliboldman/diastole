import type { Metadata } from "next";
import Link from "next/link";

import DualLine from "@/components/compare/DualLine";
import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireCoach } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Compare athletes · Diastole" };

const DAYS = 28;

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const coach = await requireCoach();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: roster } = await supabase.from("profiles").select("id, full_name, email, timezone").eq("coach_id", coach.id).eq("is_test", false).order("full_name");
  const people = (roster ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || "Athlete", tz: p.timezone }));
  const A = people.find((p) => p.id === sp.a) ?? people[0];
  const B = people.find((p) => p.id === sp.b && p.id !== A?.id) ?? people.find((p) => p.id !== A?.id);

  const picker = (which: "a" | "b", current?: string) => (
    <form className="contents">
      <input type="hidden" name={which === "a" ? "b" : "a"} value={which === "a" ? B?.id ?? "" : A?.id ?? ""} />
      <select name={which} defaultValue={current} aria-label={which === "a" ? "First athlete" : "Second athlete"} className={`min-h-11 rounded-2xl border bg-panel px-3 text-sm ${which === "a" ? "border-emerald-300/40" : "border-sky-300/40"}`}>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button className="min-h-11 rounded-2xl border border-white/15 px-3 text-sm text-white/75 hover:bg-white/[0.06]">Show</button>
    </form>
  );

  if (!A || !B) {
    return (
      <DashboardShell>
        <h1 className="text-3xl font-medium">Compare athletes</h1>
        <p className="mt-3 text-white/60">You need at least two athletes to compare.</p>
      </DashboardShell>
    );
  }

  const end = new Date().toLocaleDateString("en-CA", { timeZone: coach.timezone });
  const days = Array.from({ length: DAYS }, (_, i) => new Date(Date.parse(`${end}T12:00:00Z`) - (DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10));
  const since = days[0];
  const load = async (id: string, tz: string) => {
    const [{ data: w }, { data: acts }, { data: meals }, { data: ready }] = await Promise.all([
      supabase.from("daily_wellness").select("date, hrv_ms, resting_hr, sleep_seconds").eq("athlete_id", id).gte("date", since),
      supabase.from("activities").select("start_time, duration_s").eq("athlete_id", id).gte("start_time", `${since}T00:00:00Z`),
      supabase.from("meal_logs").select("local_date, protein_g").eq("athlete_id", id).gte("local_date", since),
      supabase.from("readiness_scores").select("date, overall").eq("athlete_id", id).gte("date", since),
    ]);
    const byDay = <T,>(rows: T[] | null, key: (r: T) => string, val: (r: T) => number | null, sum = false) =>
      days.map((d) => {
        const xs = (rows ?? []).filter((r) => key(r) === d).map(val).filter((v): v is number => v !== null && Number.isFinite(v));
        return xs.length ? (sum ? xs.reduce((s, v) => s + v, 0) : xs[0]) : null;
      });
    const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
    const minutes = byDay(acts, (r) => localDay(r.start_time), (r) => (r.duration_s ?? 0) / 60, true);
    const r = ready ?? [];
    return {
      hrv: byDay(w, (r) => r.date, (r) => (r.hrv_ms === null ? null : Number(r.hrv_ms))),
      rhr: byDay(w, (r) => r.date, (r) => (r.resting_hr === null ? null : Number(r.resting_hr))),
      sleep: byDay(w, (r) => r.date, (r) => (r.sleep_seconds ? r.sleep_seconds / 3600 : null)),
      minutes: minutes.map((m) => m ?? 0),
      protein: byDay(meals, (r) => r.local_date, (r) => Number(r.protein_g), true),
      sessions: (acts ?? []).filter((a) => (a.duration_s ?? 0) >= 600).length,
      hours: Math.round(((acts ?? []).reduce((s, a) => s + (a.duration_s ?? 0), 0) / 3600 / (DAYS / 7)) * 10) / 10,
      green: r.length ? Math.round((r.filter((x) => x.overall === "green").length / r.length) * 100) : null,
    };
  };
  const [a, b] = await Promise.all([load(A.id, A.tz), load(B.id, B.tz)]);
  const names: [string, string] = [A.name, B.name];

  return (
    <DashboardShell>
      <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">Last {DAYS} days</p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Compare athletes</h1>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {picker("a", A.id)}
        <span className="px-1 text-white/40">vs</span>
        {picker("b", B.id)}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.15em] text-white/45">
              <th className="py-2 font-medium" />
              <th className="py-2 font-medium text-emerald-200">{A.name}</th>
              <th className="py-2 font-medium text-sky-200">{B.name}</th>
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-white/[0.08]">
            <tr><td className="py-2 text-white/60">Hours per week</td><td className="tabular-nums">{a.hours}</td><td className="tabular-nums">{b.hours}</td></tr>
            <tr><td className="py-2 text-white/60">Sessions (10+ min)</td><td className="tabular-nums">{a.sessions}</td><td className="tabular-nums">{b.sessions}</td></tr>
            <tr><td className="py-2 text-white/60">Green readiness days</td><td className="tabular-nums">{a.green ?? "—"}{a.green !== null && "%"}</td><td className="tabular-nums">{b.green ?? "—"}{b.green !== null && "%"}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <DualLine title="Training minutes per day" days={days} a={a.minutes} b={b.minutes} fmt={(v) => `${Math.round(v)} min`} names={names} />
        <DualLine title="Sleep" days={days} a={a.sleep} b={b.sleep} fmt={(v) => `${v.toFixed(1)} h`} names={names} />
        <DualLine title="HRV" days={days} a={a.hrv} b={b.hrv} fmt={(v) => `${Math.round(v)} ms`} names={names} />
        <DualLine title="Resting heart rate" days={days} a={a.rhr} b={b.rhr} fmt={(v) => `${Math.round(v)} bpm`} names={names} />
        <DualLine title="Protein logged per day" days={days} a={a.protein} b={b.protein} fmt={(v) => `${Math.round(v)} g`} names={names} />
      </div>
      <p className="mt-4 max-w-2xl text-xs text-white/45">HRV from Garmin and Apple is measured differently, so compare each athlete with their own trend rather than with each other. Solid line: {A.name.split(" ")[0]}. Dashed: {B.name.split(" ")[0]}.</p>
      <Link href="/athletes" className="mt-4 inline-flex min-h-11 items-center text-sm text-emerald-200 hover:underline">← Athletes</Link>
    </DashboardShell>
  );
}

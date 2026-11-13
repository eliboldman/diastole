import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireCoach } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "System health · Diastole" };

type Health = {
  jobs: { job: string; last_run_at: string; last_ok: boolean; last_error: string | null; last_error_at: string | null; last_detail: unknown }[];
  cron: { name: string; schedule: string; active: boolean; last_start: string | null; last_status: string | null; ok_24h: number; failed_24h: number }[] | { error: string };
  pings: { total_24h: number; failed_24h: number; last_error: string | null } | { error: string };
  refuel: { last_at: string | null; sent_24h: number; ate_24h: number; quiet_24h: number; sent_7d: number; ate_7d: number; quiet_7d: number };
  push: { created_24h: number; pushed_24h: number; unpushed_with_device_24h: number; devices: number; apns_failures_24h: number; last_apns_failure: unknown };
  garmin: { last_at: string | null; ok_24h: number; errors_24h: number; last_error: string | null; last_error_at: string | null };
  stale_devices: { name: string; source: string; last_synced_at: string | null }[];
  events: { at: string; kind: string; detail: unknown }[];
};

// How often each job should run (minutes), to flag one that has gone quiet.
const EXPECT: Record<string, { every: number; label: string; what: string }> = {
  refuel: { every: 5, label: "Protein reminders", what: "Every 5 min: sends post-workout protein reminders and dietitian alerts" },
  morning: { every: 24 * 60, label: "Morning job", what: "Daily: readiness, AI analysis, grit, challenge wrap-ups" },
  evening: { every: 24 * 60, label: "Evening job", what: "Daily: recaps, baton, campfires, stories" },
};

type Tone = "ok" | "warn" | "bad";
const DOT: Record<Tone, string> = { ok: "bg-emerald-300", warn: "bg-amber-300", bad: "bg-red-400" };

export default async function HealthPage() {
  const me = await requireCoach();
  const { h, now } = await load();
  const ago = (iso: string | null) => {
    if (!iso) return "never";
    const m = Math.round((now - Date.parse(iso)) / 60000);
    return m < 1 ? "just now" : m < 90 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
  };
  const at = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: me.timezone });

  const jobRows = Object.entries(EXPECT).map(([job, e]) => {
    const j = h.jobs.find((x) => x.job === job);
    const late = !j || now - Date.parse(j.last_run_at) > (e.every * 2 + 10) * 60000;
    const tone: Tone = !j ? "warn" : !j.last_ok ? "bad" : late ? "bad" : "ok";
    const status = !j ? "No run recorded yet (records start with this update)" : !j.last_ok ? `Last run failed: ${j.last_error ?? "error"}` : late ? `Late: last ran ${ago(j.last_run_at)}` : `Ran ${ago(j.last_run_at)}`;
    return { tone, title: e.label, sub: e.what, status, extra: j?.last_error_at && j.last_ok ? `Last failure ${at(j.last_error_at)}` : null };
  });

  const cron = Array.isArray(h.cron) ? h.cron : [];
  const pings = "error" in h.pings ? null : h.pings;
  const r = h.refuel;
  const p = h.push;
  const g = h.garmin;
  const garminTone: Tone = g.errors_24h > 0 ? "warn" : !g.last_at || now - Date.parse(g.last_at) > 12 * 3600000 ? "warn" : "ok";
  const pushTone: Tone = p.apns_failures_24h > 0 || p.unpushed_with_device_24h > 3 ? "warn" : "ok";
  const allOk = jobRows.every((x) => x.tone === "ok") && garminTone === "ok" && pushTone === "ok" && !(pings && pings.failed_24h > 0) && cron.every((c) => !c.failed_24h);

  return (
    <DashboardShell>
      <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">Behind the scenes</p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">System health</h1>
      <p className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${allOk ? "border-emerald-300/30 bg-emerald-300/[0.08] text-emerald-100" : "border-amber-300/30 bg-amber-300/[0.08] text-amber-100"}`}>
        <span className={`h-2 w-2 rounded-full ${allOk ? DOT.ok : DOT.warn}`} /> {allOk ? "Everything looks healthy" : "Something needs a look"}
      </p>

      <Section title="Scheduled jobs">
        {jobRows.map((j) => (
          <Row key={j.title} tone={j.tone} title={j.title} sub={j.sub} right={j.status} extra={j.extra} />
        ))}
        {cron.map((c) => (
          <Row key={c.name} tone={c.failed_24h ? "bad" : c.active ? "ok" : "warn"} title={`Database timer: ${c.name}`} sub={`Schedule ${c.schedule}${c.active ? "" : " (paused)"}`} right={`${c.ok_24h} ok · ${c.failed_24h} failed in 24 h`} extra={c.last_start ? `Last ${ago(c.last_start)}` : null} />
        ))}
        {pings && <Row tone={pings.failed_24h ? "warn" : "ok"} title="Database → app pings" sub="Push delivery and job triggers sent from the database" right={`${pings.total_24h} in 24 h · ${pings.failed_24h} failed`} extra={pings.last_error ? `Last error: ${pings.last_error}` : null} />}
      </Section>

      <Section title="Protein reminders">
        <Row tone={r.last_at && now - Date.parse(r.last_at) < 3 * 86400000 ? "ok" : "warn"} title="Post-workout reminders" sub="Sent: reminder went out · Already ate: protein logged first · Quiet: athlete turned it off (dietitians still alerted)" right={`Last ${ago(r.last_at)}`} />
        <Stat items={[["Sent 24 h", r.sent_24h], ["Already ate 24 h", r.ate_24h], ["Quiet 24 h", r.quiet_24h], ["Sent 7 d", r.sent_7d], ["Already ate 7 d", r.ate_7d], ["Quiet 7 d", r.quiet_7d]]} />
      </Section>

      <Section title="Push notifications">
        <Row tone={pushTone} title="iPhone pushes" sub={`${p.devices} device${p.devices === 1 ? "" : "s"} registered`} right={`${p.pushed_24h} of ${p.created_24h} pushed in 24 h`} extra={p.apns_failures_24h ? `${p.apns_failures_24h} Apple delivery failures in 24 h` : p.unpushed_with_device_24h ? `${p.unpushed_with_device_24h} not pushed to someone with a device` : null} />
      </Section>

      <Section title="Garmin">
        <Row tone={garminTone} title="Garmin data feed" sub="Garmin sends sleep, HRV and workouts here as they sync" right={`Last ${ago(g.last_at)}`} extra={`${g.ok_24h} ok · ${g.errors_24h} errors in 24 h${g.last_error ? ` · last error ${g.last_error_at ? at(g.last_error_at) : ""}: ${g.last_error}` : ""}`} />
        {h.stale_devices.length > 0 ? (
          h.stale_devices.map((d) => <Row key={d.name + d.source} tone="warn" title={d.name} sub={`${d.source === "garmin" ? "Garmin" : "Apple Watch"} hasn't synced in 36+ hours`} right={`Last ${ago(d.last_synced_at)}`} />)
        ) : (
          <Row tone="ok" title="Every connected watch synced in the last 36 hours" />
        )}
      </Section>

      {h.events.length > 0 && (
        <Section title="Recent problems (7 days)">
          {h.events.map((e, i) => (
            <Row key={i} tone="warn" title={e.kind.replace(/_/g, " ")} sub={JSON.stringify(e.detail).slice(0, 160)} right={at(e.at)} />
          ))}
        </Section>
      )}
    </DashboardShell>
  );
}

async function load(): Promise<{ h: Health; now: number }> {
  const { data } = await (await createClient()).rpc("system_health");
  if (!data) notFound();
  return { h: data as Health, now: Date.now() };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 max-w-3xl">
      <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-[0.2em] text-white/45">{title}</h2>
      <ul className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.05] [&>li+li]:border-t [&>li+li]:border-white/[0.08]">{children}</ul>
    </section>
  );
}

function Row({ tone, title, sub, right, extra }: { tone: Tone; title: string; sub?: string; right?: string; extra?: string | null }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[tone]}`} aria-label={tone === "ok" ? "OK" : tone === "warn" ? "Warning" : "Problem"} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{title}</span>
        {sub && <span className="block text-xs text-white/50">{sub}</span>}
        {extra && <span className="mt-0.5 block break-words text-xs text-amber-100/80">{extra}</span>}
      </span>
      {right && <span className="shrink-0 text-right text-xs text-white/65 sm:text-sm">{right}</span>}
    </li>
  );
}

function Stat({ items }: { items: [string, number][] }) {
  return (
    <li className="grid grid-cols-3 gap-px bg-white/[0.06]">
      {items.map(([k, v]) => (
        <span key={k} className="bg-panel/60 px-4 py-3">
          <span className="block text-xl font-semibold tabular-nums">{v}</span>
          <span className="block text-xs text-white/50">{k}</span>
        </span>
      ))}
    </li>
  );
}

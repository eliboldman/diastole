import type { Metadata } from "next";

import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import SecretSwitch from "@/components/secrets/SecretSwitch";
import { SECRETS, tierOf } from "@/lib/secrets";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Secrets · Diastole" };

const TIER_NAMES = ["", "Night Shift", "Nocturnal", "Creature of the Night"];

/** The Secrets collection: locked silhouettes with a hint, found ones with the date and a switch. */
export default async function SecretsPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const { data: rows } = await supabase.from("user_secrets").select("secret_id, found_at, count, enabled").eq("athlete_id", me.id);
  const byId = new Map((rows ?? []).map((r) => [r.secret_id, r]));
  const found = SECRETS.filter((s) => byId.has(s.id)).length;

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <BackLink href="/account" label="Me" />
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Secrets</h1>
      <p className="mt-2 text-white/55">
        {found} of {SECRETS.length} found. Little surprises hidden around Diastole. Each hint is a clue.
      </p>
      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SECRETS.map((s) => {
          const r = byId.get(s.id);
          if (!r) {
            return (
              <li key={s.id} className="flex flex-col rounded-[24px] border border-dashed border-white/12 bg-white/[0.025] p-4">
                <span className="text-4xl opacity-30 blur-[3px] grayscale" aria-hidden>
                  {s.emoji}
                </span>
                <span className="mt-3 text-sm font-medium text-white/40">???</span>
                <span className="mt-1 text-sm italic text-white/60">{s.hint}</span>
              </li>
            );
          }
          const tier = s.tiers ? tierOf(s, r.count) : 0;
          return (
            <li key={s.id} className="flex flex-col rounded-[24px] border border-amber-200/20 bg-gradient-to-br from-amber-200/[0.07] to-white/[0.02] p-4">
              <span className="text-4xl" aria-hidden>
                {s.emoji}
              </span>
              <span className="mt-3 font-medium">{s.name}</span>
              {s.tiers && (
                <span className="mt-1 flex items-center gap-1 text-xs text-amber-100/80">
                  {s.tiers.map((t, i) => (
                    <span key={t} className={`h-1.5 w-5 rounded-full ${i < tier ? "bg-amber-200" : "bg-white/15"}`} aria-hidden />
                  ))}
                  <span className="ml-1">
                    {TIER_NAMES[tier]} · {r.count}
                  </span>
                </span>
              )}
              <span className="mt-1 text-xs text-white/55">{s.found}</span>
              <span className="mt-2 text-[11px] text-white/40">
                Found {new Date(r.found_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: me.timezone })}
              </span>
              <SecretSwitch id={s.id} initial={r.enabled} />
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-xs text-white/40">Turn all Easter eggs or pod posts on or off in Settings → Easter eggs.</p>
    </DashboardShell>
  );
}

import { Check } from "lucide-react";
import Link from "next/link";

import DismissChecklist from "@/components/onboarding/DismissChecklist";
import { createClient } from "@/lib/supabase/server";

export const CHECKLIST_TIP = "tip:first-week";

/**
 * New athletes' setup on Today: connect a watch, numbers, training days, a check-in, a pod.
 * Disappears once everything's done (or when dismissed); for the first 30 days only.
 */
export default async function FirstWeek({ athleteId, dismissed }: { athleteId: string; dismissed: boolean }) {
  if (dismissed) return null;
  const supabase = await createClient();
  const { data: me } = await supabase.from("profiles").select("created_at").eq("id", athleteId).maybeSingle();
  if (me?.created_at && tooOld(me.created_at)) return null;
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => (r.count ?? 0) > 0);
  const [watch, zones, week, checkin, pod, avatar] = await Promise.all([
    count(supabase.from("device_connections").select("athlete_id", { count: "exact", head: true }).eq("athlete_id", athleteId)),
    supabase.from("athlete_zones").select("max_hr, threshold_speed_mps, ftp_w").eq("athlete_id", athleteId).maybeSingle().then((r) => !!(r.data && (r.data.max_hr || r.data.threshold_speed_mps || r.data.ftp_w))),
    supabase.from("athlete_week").select("days").eq("athlete_id", athleteId).maybeSingle().then((r) => !!r.data && Object.keys((r.data.days as object) ?? {}).length > 0),
    count(supabase.from("workout_checkins").select("activity_id", { count: "exact", head: true }).eq("athlete_id", athleteId)),
    count(supabase.from("pod_members").select("pod_id", { count: "exact", head: true }).eq("athlete_id", athleteId).eq("status", "active")),
    count(supabase.from("avatars").select("athlete_id", { count: "exact", head: true }).eq("athlete_id", athleteId)),
  ]);
  const steps = [
    { done: watch, label: "Connect your watch", href: "/connect" },
    { done: zones, label: "Add your numbers (max HR, threshold pace, FTP)", href: "/me/setup#numbers" },
    { done: week, label: "Set your training days", href: "/me/setup#week" },
    { done: avatar, label: "Make your avatar", href: "/profile/edit" },
    { done: checkin, label: "Check in after a workout", href: "/training" },
    { done: pod, label: "Join a pod", href: "/me/pods" },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <section className="row-in mt-6 rounded-[28px] border border-emerald-300/20 bg-emerald-300/[0.06] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Get set up</h2>
        <span className="text-sm tabular-nums text-white/60">
          {done} of {steps.length}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length} aria-label="Setup progress">
        <div className="h-full rounded-full bg-emerald-300 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-3 space-y-1">
        {steps.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className={`flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm ${s.done ? "text-white/45 line-through" : "text-white/85 hover:bg-white/[0.05]"}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${s.done ? "border-emerald-300 bg-emerald-300 text-emerald-950" : "border-white/30"}`}>{s.done && <Check size={12} strokeWidth={3} />}</span>
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
      <DismissChecklist id={CHECKLIST_TIP} />
    </section>
  );
}

const tooOld = (iso: string) => Date.now() - Date.parse(iso) > 30 * 86_400_000;

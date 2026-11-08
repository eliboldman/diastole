import { secretById } from "@/lib/secrets";
import { createClient } from "@/lib/supabase/server";

/** "Walker discovered Night Shift": recent finds by pod members who chose to share them. Hidden when there are none. */
export default async function RecentDiscoveries({ podId }: { podId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_pod_secret_posts", { p_pod: podId });
  const rows = (data ?? []) as { athlete_id: string; first_name: string; secret_id: string; created_at: string }[];
  if (!rows.length) return null;
  return (
    <section className="mt-6 rounded-[24px] border border-amber-200/15 bg-amber-200/[0.04] p-4" aria-label="Recent discoveries">
      <p className="text-[11px] uppercase tracking-[0.15em] text-amber-100/70">Recent discoveries</p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => {
          const s = secretById(r.secret_id);
          if (!s) return null;
          return (
            <li key={`${r.athlete_id}-${r.secret_id}`} className="flex items-center gap-2 text-sm">
              <span aria-hidden>{s.emoji}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{r.first_name}</span> discovered {s.name}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

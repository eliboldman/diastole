import { describe } from "@/lib/workouts/describe";
import type { Step } from "@/lib/workouts/garmin-format";

export type Version = {
  version: number;
  change: string;
  title: string;
  scheduled_date: string;
  steps: Step[];
  created_at: string;
};

export default function VersionHistory({ versions }: { versions: Version[] }) {
  if (versions.length === 0) return null;
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <h2 className="font-medium">Version history</h2>
      <ol className="mt-3 space-y-2">
        {versions.map((v, i) => (
          <li key={v.version}>
            <details className="group rounded-2xl border border-white/[0.06] bg-black/20" open={i === versions.length - 1 && versions.length > 1 ? false : undefined}>
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm">
                <span>
                  <span className="text-white/40">v{v.version}</span>{" "}
                  <span className="capitalize">{v.change}</span>
                  {v.version === 1 && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/60">original</span>}
                  {i === 0 && versions.length > 1 && (
                    <span className="ml-2 rounded-full bg-emerald-300/15 px-2 py-0.5 text-[11px] text-emerald-100">current</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-white/35">
                  {new Date(v.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </summary>
              <div className="px-4 pb-4 text-sm text-white/60">
                <p className="text-white/80">
                  {v.title} · {new Date(`${v.scheduled_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </p>
                <ol className="mt-2 list-decimal space-y-0.5 pl-5">
                  {describe(v.steps).map((l, k) => (
                    <li key={k}>{l}</li>
                  ))}
                </ol>
              </div>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

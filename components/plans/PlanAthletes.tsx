"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { applyUpdate, previewUpdate, skipUpdate, type UpdateView } from "@/lib/plans/actions";

type App = { id: string; name: string; athleteId: string; start: string; race: string | null; behind: boolean };
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Who's on this plan, and a reviewed update for anyone who started before the latest edits. */
export default function PlanAthletes({ apps }: { apps: App[]; version: number }) {
  if (!apps.length) return null;
  return (
    <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 sm:p-6">
      <h2 className="text-lg font-medium">Athletes on this plan</h2>
      <p className="mt-1 text-sm text-white/55">Editing the plan never changes theirs by itself. When it&apos;s been updated since they started, review the changes and apply them with your OK.</p>
      <ul className="mt-3 divide-y divide-white/[0.08]">
        {apps.map((a) => (
          <Row key={a.id} a={a} />
        ))}
      </ul>
    </section>
  );
}

function Row({ a }: { a: App }) {
  const router = useRouter();
  const [changes, setChanges] = useState<UpdateView[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1">
          <Link href={`/athlete/${a.athleteId}#week`} className="font-medium hover:underline">
            {a.name}
          </Link>
          <span className="block text-xs text-white/50">
            From {day(a.start)}
            {a.race ? ` · race ${day(a.race)}` : ""}
          </span>
        </span>
        {a.behind ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await previewUpdate(a.id);
                if (r.ok) setChanges(r.changes);
                else setMsg(r.error);
              })
            }
            className="flex min-h-10 items-center gap-1.5 rounded-xl border border-amber-200/30 bg-amber-200/10 px-3 text-sm text-amber-50"
          >
            <RefreshCw size={14} aria-hidden /> Review update
          </button>
        ) : (
          <span className="text-xs text-white/45">Up to date</span>
        )}
      </div>
      {changes && (
        <div className="mt-3 rounded-2xl bg-white/[0.03] p-3">
          {changes.length === 0 ? (
            <p className="text-sm text-white/60">No upcoming sessions change for {a.name.split(" ")[0]}.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {changes.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className={`w-16 shrink-0 text-xs font-medium uppercase ${c.kind === "add" ? "text-emerald-200" : c.kind === "remove" ? "text-red-200" : "text-amber-100"}`}>{c.kind === "update" ? "changed" : c.kind === "add" ? "new" : "removed"}</span>
                  <span className="min-w-0 flex-1">
                    {day(c.date)} · {c.title}
                    {c.what?.length ? <span className="text-white/50"> ({c.what.join(", ")})</span> : null}
                    {c.onWatch ? <span className="text-white/50"> · on the watch, will be re-sent</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {changes.length > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await applyUpdate(a.id);
                    setMsg(r.ok ? r.message : r.error);
                    setChanges(null);
                    router.refresh();
                  })
                }
                className="min-h-10 rounded-xl border border-emerald-300/25 bg-emerald-300/20 px-4 text-sm font-medium text-emerald-50"
              >
                {pending ? "Applying…" : "Apply these changes"}
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await skipUpdate(a.id);
                  setChanges(null);
                  setMsg("Kept their plan as it is.");
                  router.refresh();
                })
              }
              className="min-h-10 rounded-xl px-3 text-sm text-white/60 hover:bg-white/[0.05]"
            >
              Keep theirs as is
            </button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-white/65">{msg}</p>}
    </li>
  );
}

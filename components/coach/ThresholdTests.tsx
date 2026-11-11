"use client";

import { Gauge } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { TESTS, type TestKind } from "@/lib/training/tests";
import { scheduleTest } from "@/lib/training/tests-actions";
import type { TestGroup, TestStatus } from "@/lib/training/tests-data";

const ROWS: { group: TestGroup; label: string; kinds: TestKind[] }[] = [
  { group: "bike", label: "Bike FTP", kinds: ["ftp20", "ramp"] },
  { group: "swim", label: "Swim CSS", kinds: ["css"] },
  { group: "run", label: "Run threshold", kinds: ["run30"] },
];
const DUE_DAYS = 56; // about 8 weeks

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** When each threshold test was last done, and one tap to put one on the plan as a draft. */
export default function ThresholdTests({ athleteId, status, today }: { athleteId: string; status: TestStatus; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(plusDays(today, 1));
  const [msg, setMsg] = useState<{ text: string; href?: string } | null>(null);

  const add = (kind: TestKind) =>
    start(async () => {
      const r = await scheduleTest(athleteId, kind, date);
      if (r.ok) {
        setMsg({ text: `${TESTS[kind].title} added as a draft for ${short(date)}.`, href: `/athlete/${athleteId}/workouts/${r.id}` });
        router.refresh();
      } else setMsg({ text: r.error });
    });

  return (
    <div className="mt-6 border-t border-white/[0.08] pt-5">
      <h3 className="flex items-center gap-2 font-medium">
        <Gauge size={16} className="text-emerald-200" aria-hidden /> Threshold tests
      </h3>
      <p className="mt-1 text-sm text-white/55">A test sets a zone from a real effort. When it&apos;s done, the result shows up above for you to apply. About every 8 weeks keeps targets honest.</p>
      <ul className="mt-3 divide-y divide-white/[0.08]">
        {ROWS.map(({ group, label, kinds }) => {
          const s = status[group];
          const age = s.last ? daysBetween(s.last, today) : null;
          const due = age === null || age > DUE_DAYS;
          return (
            <li key={group} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-sm font-medium">
                  {label}
                  {due && !s.planned && <span className="ml-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[11px] font-medium text-amber-100">{age === null ? "Never tested" : "Due"}</span>}
                </p>
                <p className="text-xs text-white/50">
                  {s.last ? (
                    <>
                      Last test{" "}
                      <Link href={`/activity/${s.activityId}`} className="text-emerald-200/80 hover:underline">
                        {short(s.last)}
                      </Link>
                      {age !== null && ` · ${age === 0 ? "today" : `${age} days ago`}`}
                    </>
                  ) : (
                    "No test in the last year"
                  )}
                </p>
              </div>
              {s.planned ? (
                <Link href={`/athlete/${athleteId}/workouts/${s.planned.id}`} className="min-h-11 content-center rounded-xl px-3 text-sm text-emerald-200 hover:bg-white/[0.05]">
                  {TESTS[s.planned.kind].title} on {short(s.planned.date)} →
                </Link>
              ) : (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {kinds.map((k) => (
                    <button
                      key={k}
                      type="button"
                      disabled={pending}
                      onClick={() => add(k)}
                      title={TESTS[k].description}
                      aria-label={`Add ${TESTS[k].title} as a draft`}
                      className="min-h-11 rounded-xl border border-white/10 px-3 text-sm text-white/80 hover:bg-white/[0.05] disabled:opacity-50"
                    >
                      + {kinds.length > 1 ? TESTS[k].title : "Add test"}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <label className="mt-2 flex items-center gap-2 text-sm text-white/55">
        New tests go on
        <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="min-h-10 rounded-xl border border-white/10 bg-white/[0.04] px-2 text-white" />
        <span className="text-xs">as drafts: approve and send as usual.</span>
      </label>
      {msg && (
        <p role="status" className="mt-2 text-sm text-emerald-100/90">
          {msg.text}{" "}
          {msg.href && (
            <Link href={msg.href} className="text-emerald-200 hover:underline">
              Open it →
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

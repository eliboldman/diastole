"use client";

import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { addCourseSession } from "@/lib/course/actions";
import type { CourseSession } from "@/lib/course/course";

/** Sessions that rehearse the course. Coach: add one as a draft on a date. */
export default function CourseSessions({ raceId, athleteId, sessions, added, coach, defaultDate, maxDate }: { raceId: string; athleteId: string; sessions: CourseSession[]; added: { key: string; id: string; date: string; status: string }[]; coach: boolean; defaultDate: string; maxDate: string }) {
  const [dates, setDates] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string; id?: string }>>({});
  const [pending, start] = useTransition();
  if (!sessions.length) return <p className="text-sm text-white/55">Course sessions show up once there&apos;s a climb to rehearse or a pace to practise (add zones for race-pace work).</p>;
  return (
    <ul className="grid gap-2">
      {sessions.map((s) => {
        const mine = added.filter((a) => a.key === s.key);
        const m = msg[s.key];
        return (
          <li key={s.key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="font-medium">{s.title}</p>
            <p className="mt-1 text-sm text-white/60">{s.description}</p>
            {mine.length > 0 && (
              <p className="mt-2 text-xs text-white/50">
                On the calendar:{" "}
                {mine.map((a, i) => (
                  <span key={a.id}>
                    {i ? ", " : ""}
                    {new Date(`${a.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} ({a.status === "completed" ? "done" : a.status})
                  </span>
                ))}
              </p>
            )}
            {coach && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={dates[s.key] ?? defaultDate}
                  min={defaultDate}
                  max={maxDate}
                  onChange={(e) => setDates({ ...dates, [s.key]: e.target.value })}
                  className="min-h-11 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[16px] text-white [color-scheme:dark]"
                  aria-label={`Date for ${s.title}`}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await addCourseSession(raceId, s.key, dates[s.key] ?? defaultDate);
                      setMsg({ ...msg, [s.key]: r.ok ? { ok: true, text: r.message ?? "Added.", id: r.id } : { ok: false, text: r.error } });
                    })
                  }
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 text-sm text-emerald-50 disabled:opacity-50"
                >
                  <CalendarPlus size={15} aria-hidden /> Add as draft
                </button>
              </div>
            )}
            {m && (
              <p className={`mt-2 text-xs ${m.ok ? "text-emerald-200" : "text-red-200"}`}>
                {m.text}{" "}
                {m.id && (
                  <Link href={`/athlete/${athleteId}/workouts/${m.id}`} className="underline">
                    Open it
                  </Link>
                )}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

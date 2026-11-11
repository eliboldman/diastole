"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeCourse, saveCourse } from "@/lib/course/actions";
import { buildCourse, parseGpx, type Leg } from "@/lib/course/course";

const field = "rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[16px] text-white focus:border-emerald-300/40 focus:outline-none";

/** Add or replace a race's course from a GPX file (read in the browser; the profile, climbs and a simplified route are saved). */
export default function CourseUpload({ raceId, sport, hasCourse }: { raceId: string; sport: string; hasCourse: boolean }) {
  const router = useRouter();
  const [leg, setLeg] = useState<Leg>(sport === "bike" ? "bike" : sport === "tri" ? "bike" : "run");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 25_000_000) return setMsg({ ok: false, text: "That file is too big (25 MB max)." });
    let course;
    try {
      course = buildCourse(parseGpx(await file.text()));
    } catch (e) {
      return setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't read that file." });
    }
    start(async () => {
      const r = await saveCourse(raceId, course, leg, name || file.name.replace(/\.gpx$/i, ""));
      setMsg(r.ok ? { ok: true, text: `Course added: ${r.message}` } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {sport === "tri" && (
          <label className="text-xs text-white/55">
            Which leg
            <select value={leg} onChange={(e) => setLeg(e.target.value as Leg)} className={`${field} mt-1 block bg-panel`}>
              <option value="bike">Bike course</option>
              <option value="run">Run course</option>
            </select>
          </label>
        )}
        <label className="min-w-0 flex-1 basis-48 text-xs text-white/55">
          Name (optional)
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Lake loop, 2 laps" className={`${field} mt-1 block w-full`} />
        </label>
      </div>
      <label className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-emerald-300/30 bg-emerald-300/[0.05] px-4 text-sm text-emerald-50 ${pending ? "opacity-50" : ""}`}>
        <Upload size={16} aria-hidden />
        {pending ? "Reading the course…" : hasCourse ? "Replace with another GPX file" : "Choose a GPX file"}
        <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" className="sr-only" disabled={pending} onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <p className="text-xs text-white/45">Most race websites post one; you can also export a route from Strava, Garmin Connect or RideWithGPS.</p>
      {hasCourse && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await removeCourse(raceId);
              router.refresh();
            })
          }
          className="min-h-11 justify-self-start text-sm text-white/50 hover:text-red-300"
        >
          Remove course
        </button>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-200" : "text-red-200"}`}>{msg.text}</p>}
    </div>
  );
}

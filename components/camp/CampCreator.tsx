"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createCamp } from "@/lib/camp/actions";

const field = "mt-1 block w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[16px] text-white focus:border-emerald-300/40 focus:outline-none";

/** Coach: start a camp in this pod from a plan template. */
export default function CampCreator({ podId, templates, today }: { podId: string; templates: { id: string; name: string; weeks: number }[]; today: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [start, setStart] = useState(today);
  const [metric, setMetric] = useState<"sessions" | "hours" | "distance">("sessions");
  const [goal, setGoal] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, run] = useTransition();
  if (!templates.length) return <p className="text-sm text-white/55">Camps use one of your plans. Save a plan of up to 4 weeks in Library → Plans, then start a camp here.</p>;
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await createCamp(podId, { title, blurb, templateId, startDate: start, goalMetric: metric, goalValue: Number(goal) });
          setMsg(r.ok ? { ok: true, text: r.message ?? "Created." } : { ok: false, text: r.error });
          if (r.ok) {
            setTitle("");
            setBlurb("");
            setGoal("");
            router.refresh();
          }
        });
      }}
    >
      <label className="text-xs text-white/55 sm:col-span-2">
        Name
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required placeholder="e.g. Winter base camp" className={field} />
      </label>
      <label className="text-xs text-white/55 sm:col-span-2">
        What it&apos;s about (optional)
        <input value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={400} placeholder="Two weeks of aerobic volume, together." className={field} />
      </label>
      <label className="text-xs text-white/55">
        Plan
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={`${field} bg-panel`}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.weeks} wk)
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-white/55">
        Starts the week of
        <input type="date" value={start} min={today} onChange={(e) => setStart(e.target.value)} className={`${field} [color-scheme:dark]`} />
      </label>
      <label className="text-xs text-white/55">
        Team goal
        <input inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value.replace(/[^\d.]/g, ""))} required placeholder="e.g. 60" className={field} />
      </label>
      <label className="text-xs text-white/55">
        Counted in
        <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)} className={`${field} bg-panel`}>
          <option value="sessions">Camp sessions done</option>
          <option value="hours">Hours trained</option>
          <option value="distance">Kilometres</option>
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="min-h-11 rounded-xl bg-emerald-300 px-5 text-sm font-medium text-black disabled:opacity-40">
          {pending ? "Creating…" : "Create camp"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-200" : "text-red-200"}`}>{msg.text}</span>}
      </div>
      <p className="text-xs text-white/45 sm:col-span-2">Camps start on a Monday. Members choose to join; joining puts the sessions on their calendar and watch, scaled to their own zones and training days.</p>
    </form>
  );
}

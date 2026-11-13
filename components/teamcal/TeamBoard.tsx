"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type DragEvent } from "react";

import { useToast } from "@/components/coach/Toast";
import { copyWorkoutsToAthletes, rescheduleWorkout } from "@/lib/workouts/actions";

export type BoardWorkout = { id: string; athlete_id: string; scheduled_date: string; title: string; sport: string; status: string };

const SPORT_DOT: Record<string, string> = { run: "bg-emerald-300", bike: "bg-amber-300", swim: "bg-sky-300", strength: "bg-fuchsia-300" };
const STATUS: Record<string, string> = { draft: "draft", approved: "", sent: "", completed: "done", skipped: "skipped" };

/**
 * Every athlete's week in one grid. Drag a workout to another day to move it, or onto another
 * athlete to copy it (as a draft). On a phone: tap a workout, then tap where it should go.
 * Shift/⌘-click several, then copy them to a whole pod.
 */
export default function TeamBoard({ days, today, athletes, pods, initial }: { days: string[]; today: string; athletes: { id: string; name: string }[]; pods: { id: string; name: string; members: string[] }[]; initial: BoardWorkout[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [picked, setPicked] = useState<string[]>([]);
  const [over, setOver] = useState<string | null>(null);
  const [pod, setPod] = useState(pods[0]?.id ?? "");
  const [pending, start] = useTransition();
  const { show, element: toast } = useToast(7000);

  const move = (w: BoardWorkout, athleteId: string, date: string) => {
    if (athleteId === w.athlete_id && date === w.scheduled_date) return;
    if (athleteId === w.athlete_id) {
      const from = w.scheduled_date;
      setItems((xs) => xs.map((x) => (x.id === w.id ? { ...x, scheduled_date: date } : x)));
      start(async () => {
        const r = await rescheduleWorkout(w.id, date);
        if (!r.ok) {
          setItems((xs) => xs.map((x) => (x.id === w.id ? { ...x, scheduled_date: from } : x)));
          show(r.error, { ok: false });
        } else {
          show(`Moved “${w.title}”.`, {
            onUndo: () => {
              setItems((xs) => xs.map((x) => (x.id === w.id ? { ...x, scheduled_date: from } : x)));
              start(async () => { await rescheduleWorkout(w.id, from); router.refresh(); });
            },
          });
        }
      });
    } else {
      start(async () => {
        const r = await copyWorkoutsToAthletes([w.id], [athleteId], date);
        show(r.ok ? `Copied “${w.title}” as a draft. Approve it to send.` : r.error, { ok: r.ok });
        router.refresh();
      });
    }
  };

  const onDrop = (e: DragEvent, athleteId: string, date: string) => {
    e.preventDefault();
    setOver(null);
    const w = items.find((x) => x.id === e.dataTransfer.getData("text/plain"));
    if (w) move(w, athleteId, date);
  };
  const tapCell = (athleteId: string, date: string) => {
    if (picked.length !== 1) return;
    const w = items.find((x) => x.id === picked[0]);
    setPicked([]);
    if (w) move(w, athleteId, date);
  };
  const copyToPod = () => {
    const p = pods.find((x) => x.id === pod);
    if (!p || !picked.length) return;
    start(async () => {
      const r = await copyWorkoutsToAthletes(picked, p.members);
      show(r.ok ? (r.message ?? `Copied to ${p.name} as drafts.`) : r.error, { ok: r.ok });
      setPicked([]);
      router.refresh();
    });
  };

  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
  const sel = picked.length === 1 ? items.find((x) => x.id === picked[0]) : null;

  return (
    <div className="mt-6">
      <p className="mb-3 text-xs text-white/45">
        {sel ? `Tap a day to move “${sel.title}” (another athlete's row copies it).` : "Drag a workout to move it, or onto another athlete to copy it. On a phone, tap it first. Shift-click several to copy to a pod."}
      </p>
      {picked.length > 1 && pods.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-3 text-sm">
          <span>{picked.length} selected</span>
          <select value={pod} onChange={(e) => setPod(e.target.value)} aria-label="Pod" className="min-h-10 rounded-xl border border-white/15 bg-panel px-2">
            {pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button disabled={pending} onClick={copyToPod} className="min-h-10 rounded-xl bg-emerald-300 px-3 font-semibold text-emerald-950 disabled:opacity-50">Copy to pod</button>
          <button onClick={() => setPicked([])} className="min-h-10 rounded-xl px-3 text-white/60">Clear</button>
        </div>
      )}
      <div className="overflow-x-auto rounded-[24px] border border-white/10">
        <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-white/[0.04] text-xs text-white/50">
              <th className="w-36 px-3 py-2 text-left font-medium">Athlete</th>
              {days.map((d) => <th key={d} className={`px-2 py-2 text-left font-medium ${d === today ? "text-emerald-200" : ""}`}>{fmt(d)}</th>)}
            </tr>
          </thead>
          <tbody>
            {athletes.map((a) => (
              <tr key={a.id} className="border-t border-white/[0.07] align-top">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  <Link href={`/athlete/${a.id}`} className="hover:underline">{a.name.split(" ")[0]}</Link>
                </th>
                {days.map((d) => {
                  const cell = `${a.id}:${d}`;
                  const ws = items.filter((w) => w.athlete_id === a.id && w.scheduled_date === d);
                  return (
                    <td
                      key={d}
                      onDragOver={(e) => { e.preventDefault(); setOver(cell); }}
                      onDragLeave={() => setOver((o) => (o === cell ? null : o))}
                      onDrop={(e) => onDrop(e, a.id, d)}
                      onClick={() => tapCell(a.id, d)}
                      className={`h-20 px-1.5 py-1.5 transition ${over === cell ? "bg-emerald-300/[0.12]" : sel ? "cursor-pointer hover:bg-white/[0.05]" : ""} ${d === today ? "bg-white/[0.02]" : ""}`}
                    >
                      <div className="space-y-1">
                        {ws.map((w) => {
                          const on = picked.includes(w.id);
                          return (
                            <button
                              key={w.id}
                              type="button"
                              draggable={w.status !== "completed"}
                              onDragStart={(e) => e.dataTransfer.setData("text/plain", w.id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (e.shiftKey || e.metaKey || e.ctrlKey) setPicked((p) => (p.includes(w.id) ? p.filter((x) => x !== w.id) : [...p, w.id]));
                                else setPicked((p) => (p.length === 1 && p[0] === w.id ? [] : [w.id]));
                              }}
                              onDoubleClick={() => router.push(`/athlete/${w.athlete_id}/workouts/${w.id}`)}
                              title={`${w.title} (double-click to open)`}
                              className={`flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-xs ${on ? "border-emerald-300/60 bg-emerald-300/20" : "border-white/10 bg-white/[0.06] hover:bg-white/[0.1]"} ${w.status === "completed" ? "opacity-60" : ""}`}
                            >
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SPORT_DOT[w.sport] ?? "bg-white/50"}`} aria-hidden />
                              <span className="min-w-0 flex-1 truncate">{w.title}</span>
                              {STATUS[w.status] && <span className="shrink-0 text-[10px] text-white/45">{STATUS[w.status]}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {toast}
    </div>
  );
}

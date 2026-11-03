"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveAndSend, deleteDraft, deliver, saveDraft, type WorkoutInput } from "@/app/(coach)/athlete/[id]/workouts/actions";
import { describe } from "@/lib/workouts/describe";
import type { Duration, Intensity, Sport, Step, Target } from "@/lib/workouts/garmin-format";

// ---------- unit helpers (UI works in minutes:seconds, miles/km; storage is seconds, meters, sec/km)
const MI = 1609.344;
const parseClock = (s: string) => {
  const m = s.trim().match(/^(\d+)(?::(\d{1,2}))?$/);
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : NaN;
};
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

type UiStep = { uid: string } & (
  | { kind: "step"; intensity: Intensity; duration: Duration; target?: Target; note?: string }
  | { kind: "repeat"; times: number; steps: UiStep[] }
);

let counter = 0;
const uid = () => `s${++counter}`;
const withIds = (steps: Step[]): UiStep[] =>
  steps.map((s) => (s.kind === "repeat" ? { ...s, uid: uid(), steps: withIds(s.steps) } : { ...s, uid: uid() }));
const stripIds = (steps: UiStep[]): Step[] =>
  steps.map((step) => {
    const s = { ...step } as Partial<UiStep>;
    delete s.uid;
    return s.kind === "repeat" ? { ...s, steps: stripIds(s.steps ?? []) } : s;
  }) as Step[];

const newStep = (intensity: Intensity = "ACTIVE"): UiStep => ({
  uid: uid(),
  kind: "step",
  intensity,
  duration: { type: "time", seconds: 600 },
});

const DEFAULT_STEPS: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 } },
  {
    kind: "repeat",
    times: 4,
    steps: [
      { kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 180 }, target: { type: "hr_zone", zone: 4 } },
      { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 120 } },
    ],
  },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "open" } },
];

const INTENSITIES: [Intensity, string][] = [
  ["WARMUP", "Warm-up"],
  ["ACTIVE", "Active"],
  ["INTERVAL", "Interval"],
  ["RECOVERY", "Recovery"],
  ["REST", "Rest"],
  ["COOLDOWN", "Cool-down"],
];

const field =
  "rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-emerald-300/40 focus:outline-none";
const sel = `${field} bg-neutral-900`;

// ---------- one step editor
function StepEditor({
  step,
  onChange,
  onRemove,
  paceUnit,
}: {
  step: Extract<UiStep, { kind: "step" }>;
  onChange: (s: UiStep) => void;
  onRemove: () => void;
  paceUnit: "mi" | "km";
}) {
  const d = step.duration;
  const t = step.target;
  const set = (patch: Partial<Extract<UiStep, { kind: "step" }>>) => onChange({ ...step, ...patch });

  return (
    <div className="grid gap-2 rounded-2xl border border-white/[0.08] bg-black/30 p-3 sm:grid-cols-[auto_auto_1fr_auto]">
      <select className={sel} value={step.intensity} onChange={(e) => set({ intensity: e.target.value as Intensity })}>
        {INTENSITIES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>

      {/* Duration */}
      <div className="flex gap-2">
        <select
          className={sel}
          value={d.type === "distance" ? `distance` : d.type}
          onChange={(e) => {
            const v = e.target.value;
            set({ duration: v === "time" ? { type: "time", seconds: 600 } : v === "distance" ? { type: "distance", meters: 1000 } : { type: "open" } });
          }}
        >
          <option value="time">Time</option>
          <option value="distance">Distance</option>
          <option value="open">Until lap</option>
        </select>
        {d.type === "time" && (
          <input
            className={`${field} w-20`}
            defaultValue={clock(d.seconds)}
            placeholder="mm:ss"
            aria-label="Duration (minutes:seconds)"
            onBlur={(e) => {
              const s = parseClock(e.target.value);
              if (s > 0) set({ duration: { type: "time", seconds: s } });
              else e.target.value = clock(d.seconds);
            }}
          />
        )}
        {d.type === "distance" && (
          <DistanceInput meters={d.meters} onChange={(m) => set({ duration: { type: "distance", meters: m } })} />
        )}
      </div>

      {/* Target */}
      <div className="flex flex-wrap gap-2">
        <select
          className={sel}
          value={t?.type ?? "none"}
          onChange={(e) => {
            const v = e.target.value;
            set({
              target:
                v === "hr_zone"
                  ? { type: "hr_zone", zone: 2 }
                  : v === "hr_range"
                    ? { type: "hr_range", low: 140, high: 155 }
                    : v === "pace_range"
                      ? { type: "pace_range", slowSecPerKm: 330, fastSecPerKm: 310 }
                      : v === "power_range"
                        ? { type: "power_range", low: 200, high: 240 }
                        : undefined,
            });
          }}
        >
          <option value="none">No target</option>
          <option value="hr_zone">HR zone</option>
          <option value="hr_range">HR range</option>
          <option value="pace_range">Pace range</option>
          <option value="power_range">Power range</option>
        </select>
        {t?.type === "hr_zone" && (
          <select className={sel} value={t.zone} onChange={(e) => set({ target: { type: "hr_zone", zone: Number(e.target.value) as 1 } })}>
            {[1, 2, 3, 4, 5].map((z) => (
              <option key={z} value={z}>
                Zone {z}
              </option>
            ))}
          </select>
        )}
        {(t?.type === "hr_range" || t?.type === "power_range") && (
          <RangeInput
            low={t.low}
            high={t.high}
            unit={t.type === "hr_range" ? "bpm" : "W"}
            onChange={(low, high) => set({ target: { ...t, low, high } })}
          />
        )}
        {t?.type === "pace_range" && (
          <PaceInput
            unit={paceUnit}
            slow={t.slowSecPerKm}
            fast={t.fastSecPerKm}
            onChange={(slow, fast) => set({ target: { type: "pace_range", slowSecPerKm: slow, fastSecPerKm: fast } })}
          />
        )}
      </div>

      <button type="button" onClick={onRemove} className="justify-self-end text-xs text-white/35 hover:text-red-300" aria-label="Remove step">
        Remove
      </button>

      <input
        className={`${field} sm:col-span-4`}
        placeholder="Note shown on the watch (optional)"
        defaultValue={step.note ?? ""}
        maxLength={512}
        onBlur={(e) => set({ note: e.target.value.trim() || undefined })}
      />
    </div>
  );
}

function DistanceInput({ meters, onChange }: { meters: number; onChange: (m: number) => void }) {
  const [unit, setUnit] = useState<"m" | "km" | "mi">(meters % 1000 === 0 && meters >= 1000 ? "km" : meters < 1000 ? "m" : "mi");
  const factor = unit === "m" ? 1 : unit === "km" ? 1000 : MI;
  return (
    <div className="flex gap-1">
      <input
        key={unit}
        className={`${field} w-20`}
        defaultValue={+(meters / factor).toFixed(2)}
        inputMode="decimal"
        aria-label="Distance"
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (v > 0) onChange(Math.round(v * factor));
        }}
      />
      <select className={sel} value={unit} onChange={(e) => setUnit(e.target.value as "m")}>
        <option value="m">m</option>
        <option value="km">km</option>
        <option value="mi">mi</option>
      </select>
    </div>
  );
}

function RangeInput({ low, high, unit, onChange }: { low: number; high: number; unit: string; onChange: (l: number, h: number) => void }) {
  return (
    <div className="flex items-center gap-1 text-sm text-white/50">
      <input className={`${field} w-16`} type="number" defaultValue={low} aria-label="Low" onBlur={(e) => onChange(Number(e.target.value), high)} />–
      <input className={`${field} w-16`} type="number" defaultValue={high} aria-label="High" onBlur={(e) => onChange(low, Number(e.target.value))} />
      {unit}
    </div>
  );
}

function PaceInput({ unit, slow, fast, onChange }: { unit: "mi" | "km"; slow: number; fast: number; onChange: (s: number, f: number) => void }) {
  const factor = unit === "mi" ? MI / 1000 : 1; // sec/km -> sec/unit
  const show = (secPerKm: number) => clock(secPerKm * factor);
  const read = (v: string) => parseClock(v) / factor;
  return (
    <div className="flex items-center gap-1 text-sm text-white/50">
      <input key={`s${unit}`} className={`${field} w-16`} defaultValue={show(slow)} aria-label="Slowest pace" onBlur={(e) => onChange(read(e.target.value) || slow, fast)} />–
      <input key={`f${unit}`} className={`${field} w-16`} defaultValue={show(fast)} aria-label="Fastest pace" onBlur={(e) => onChange(slow, read(e.target.value) || fast)} />
      /{unit}
    </div>
  );
}

// ---------- main builder
export default function WorkoutBuilder({
  athleteId,
  athleteName,
  device,
  initial,
}: {
  athleteId: string;
  athleteName: string;
  device: "garmin" | "apple" | null;
  initial?: { id: string; title: string; sport: Sport; scheduledDate: string; description: string | null; steps: Step[]; status: string };
}) {
  const router = useRouter();
  const [id, setId] = useState(initial?.id);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [sport, setSport] = useState<Sport>(initial?.sport ?? "run");
  // Tomorrow in the coach's local time (en-CA formats as YYYY-MM-DD).
  const [date, setDate] = useState(() => initial?.scheduledDate ?? new Date(Date.now() + 86400_000).toLocaleDateString("en-CA"));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [steps, setSteps] = useState<UiStep[]>(() => withIds(initial?.steps ?? DEFAULT_STEPS));
  const [paceUnit, setPaceUnit] = useState<"mi" | "km">("mi");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const editable = !initial || initial.status === "draft";
  const input = (): WorkoutInput => ({ id, athleteId, title, sport, scheduledDate: date, description, steps: stripIds(steps) });

  const updateAt = (list: UiStep[], i: number, s: UiStep) => list.map((x, j) => (j === i ? s : x));

  const run = (fn: () => Promise<{ ok: boolean; id?: string; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok && r.id) setId(r.id);
      setMessage(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error ?? "Something went wrong." });
      if (r.ok) after?.();
      router.refresh();
    });

  const destination =
    device === "garmin" ? `${athleteName}'s Garmin calendar` : device === "apple" ? `${athleteName}'s iPhone app` : `${athleteName} (no device yet)`;

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <input className={field} placeholder="Workout title, e.g. 4 × 3 min threshold" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} maxLength={100} />
        <select className={sel} value={sport} onChange={(e) => setSport(e.target.value as Sport)} disabled={!editable}>
          <option value="run">Run</option>
          <option value="bike">Bike</option>
        </select>
        <input className={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!editable} />
      </div>
      <textarea
        className={`${field} min-h-20`}
        placeholder="Description for the athlete (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={!editable}
        maxLength={1024}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Steps</h2>
        {sport === "run" && (
          <label className="flex items-center gap-2 text-xs text-white/45">
            Pace in
            <select className={sel} value={paceUnit} onChange={(e) => setPaceUnit(e.target.value as "mi")}>
              <option value="mi">min/mi</option>
              <option value="km">min/km</option>
            </select>
          </label>
        )}
      </div>

      <fieldset disabled={!editable} className="grid gap-3">
        {steps.map((s, i) =>
          s.kind === "step" ? (
            <StepEditor key={s.uid} step={s} paceUnit={paceUnit} onChange={(n) => setSteps(updateAt(steps, i, n))} onRemove={() => setSteps(steps.filter((_, j) => j !== i))} />
          ) : (
            <div key={s.uid} className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.03] p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  Repeat
                  <input
                    className={`${field} w-16`}
                    type="number"
                    min={2}
                    max={99}
                    value={s.times}
                    onChange={(e) => setSteps(updateAt(steps, i, { ...s, times: Number(e.target.value) }))}
                  />
                  times
                </label>
                <button type="button" className="text-xs text-white/35 hover:text-red-300" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                  Remove repeat
                </button>
              </div>
              <div className="grid gap-2 sm:pl-4">
                {s.steps.map((c, k) =>
                  c.kind === "step" ? (
                    <StepEditor
                      key={c.uid}
                      step={c}
                      paceUnit={paceUnit}
                      onChange={(n) => setSteps(updateAt(steps, i, { ...s, steps: updateAt(s.steps, k, n) }))}
                      onRemove={() => setSteps(updateAt(steps, i, { ...s, steps: s.steps.filter((_, j) => j !== k) }))}
                    />
                  ) : null,
                )}
                <button
                  type="button"
                  className="justify-self-start text-sm text-emerald-200/80 hover:underline"
                  onClick={() => setSteps(updateAt(steps, i, { ...s, steps: [...s.steps, newStep("RECOVERY")] }))}
                >
                  + Step inside repeat
                </button>
              </div>
            </div>
          ),
        )}
        <div className="flex gap-4">
          <button type="button" className="text-sm text-emerald-200/80 hover:underline" onClick={() => setSteps([...steps, newStep()])}>
            + Step
          </button>
          <button
            type="button"
            className="text-sm text-emerald-200/80 hover:underline"
            onClick={() => setSteps([...steps, { uid: uid(), kind: "repeat", times: 4, steps: [newStep("INTERVAL"), newStep("RECOVERY")] }])}
          >
            + Repeat
          </button>
        </div>
      </fieldset>

      {message && (
        <p className={`rounded-2xl border p-3 text-sm ${message.ok ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100" : "border-red-300/20 bg-red-300/[0.06] text-red-200"}`}>
          {message.text}
        </p>
      )}

      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={pending}
            onClick={() => run(() => saveDraft(input()))}
            className="rounded-2xl border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-medium hover:bg-white/[0.1] disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            disabled={pending}
            onClick={() => setConfirming(true)}
            className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-5 py-3 text-sm font-medium text-emerald-100 hover:bg-emerald-300/20 disabled:opacity-50"
          >
            Approve & send…
          </button>
          {id && (
            <button
              disabled={pending}
              onClick={() => run(() => deleteDraft(id, athleteId), () => router.push(`/athlete/${athleteId}`))}
              className="ml-auto text-sm text-white/35 hover:text-red-300"
            >
              Delete draft
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-4 text-sm text-white/55">
          Status: <span className="uppercase tracking-wider">{initial?.status}</span>
          {initial?.status === "approved" && device === "garmin" && id && (
            <button disabled={pending} onClick={() => run(() => deliver(id, athleteId))} className="text-emerald-200 hover:underline">
              Retry sending to Garmin
            </button>
          )}
        </div>
      )}

      {confirming && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-neutral-950 p-6">
            <h3 className="text-lg font-medium">Send this workout?</h3>
            <p className="mt-2 text-sm text-white/60">
              <strong className="text-white">{title || "Untitled"}</strong> ({sport}) on{" "}
              {new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} → {destination}
            </p>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-white/70">
              {describe(stripIds(steps), paceUnit).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirming(false)} className="rounded-2xl px-4 py-2 text-sm text-white/60 hover:text-white">
                Cancel
              </button>
              <button
                disabled={pending}
                onClick={() => run(() => approveAndSend(input()), () => setConfirming(false))}
                className="rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-300/25 disabled:opacity-50"
              >
                {pending ? "Sending…" : "Approve & send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

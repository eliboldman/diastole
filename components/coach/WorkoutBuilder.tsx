"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveAndSend, deleteDraft, deliver, saveDraft, type WorkoutInput } from "@/app/(coach)/athlete/[id]/workouts/actions";
import { buildWorkoutFromPrompt } from "@/lib/ai/build-workout";
import { draftWhyForBuilder } from "@/lib/ai/why";
import { requestWorkout, saveMyWorkout } from "@/lib/workouts/athlete-actions";
import WorkoutSummary from "@/components/workouts/WorkoutSummary";
import { describe } from "@/lib/workouts/describe";
import {
  DRILLS,
  EQUIPMENT,
  hundredMeters,
  STROKES,
  SWIM_EFFORTS,
  YARD,
  type Drill,
  type Duration,
  type Equipment,
  type Intensity,
  type Pool,
  type Sport,
  type Step,
  type Stroke,
  type SwimEffort,
  type Target,
} from "@/lib/workouts/garmin-format";

// ---------- unit helpers (UI works in minutes:seconds, miles/km; storage is seconds, meters, sec/km)
const MI = 1609.344;
const parseClock = (s: string) => {
  const m = s.trim().match(/^(\d+)(?::(\d{1,2}))?$/);
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : NaN;
};
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

type UiStep = { uid: string } & (
  | { kind: "step"; intensity: Intensity; duration: Duration; target?: Target; note?: string; stroke?: Stroke; drill?: Drill; equipment?: Equipment }
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

// Swims: distance-based, freestyle by default; 100 of the pool's unit.
const newSwimStep = (intensity: Intensity, pool: Pool): UiStep =>
  intensity === "REST"
    ? { uid: uid(), kind: "step", intensity, duration: { type: "time", seconds: 20 } }
    : { uid: uid(), kind: "step", intensity, duration: { type: "distance", meters: hundredMeters(pool) }, stroke: "FREESTYLE" };

const swimDefault = (pool: Pool): Step[] => {
  const u = hundredMeters(pool) / 100; // metres per pool unit
  return [
    { kind: "step", intensity: "WARMUP", duration: { type: "distance", meters: 300 * u }, stroke: "CHOICE", target: { type: "swim_effort", level: 3 } },
    {
      kind: "repeat",
      times: 4,
      steps: [
        { kind: "step", intensity: "MAIN", duration: { type: "distance", meters: 100 * u }, stroke: "FREESTYLE", target: { type: "swim_effort", level: 4 } },
        { kind: "step", intensity: "REST", duration: { type: "time", seconds: 20 } },
      ],
    },
    { kind: "step", intensity: "COOLDOWN", duration: { type: "distance", meters: 200 * u }, stroke: "CHOICE", target: { type: "swim_effort", level: 2 } },
  ];
};

const POOLS: { key: string; label: string; pool: Pool }[] = [
  { key: "25YARD", label: "25 yd pool", pool: { length: 25, unit: "YARD" } },
  { key: "25METER", label: "25 m pool", pool: { length: 25, unit: "METER" } },
  { key: "50METER", label: "50 m pool", pool: { length: 50, unit: "METER" } },
  { key: "any", label: "Any pool", pool: null },
];
const poolKey = (p: Pool) => (p ? `${p.length}${p.unit}` : "any");

const SWIM_INTENSITIES: [Intensity, string][] = [
  ["WARMUP", "Warm-up"],
  ["MAIN", "Main"],
  ["INTERVAL", "Interval"],
  ["RECOVERY", "Recovery"],
  ["REST", "Rest"],
  ["COOLDOWN", "Cool-down"],
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
  "min-h-11 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-base text-white sm:text-base sm:text-sm placeholder:text-white/45 focus:border-emerald-300/40 focus:outline-none";
const sel = `${field} bg-panel`;

// ---------- one step editor
function StepEditor({
  step,
  onChange,
  onRemove,
  paceUnit,
  swim,
  pool,
}: {
  step: Extract<UiStep, { kind: "step" }>;
  onChange: (s: UiStep) => void;
  onRemove: () => void;
  paceUnit: "mi" | "km";
  swim?: boolean;
  pool?: Pool;
}) {
  const d = step.duration;
  const t = step.target;
  const set = (patch: Partial<Extract<UiStep, { kind: "step" }>>) => onChange({ ...step, ...patch });
  if (swim) return <SwimStepEditor step={step} set={set} onRemove={onRemove} pool={pool ?? null} />;

  return (
    <div className="grid gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.05] p-3 sm:grid-cols-[auto_auto_1fr_auto]">
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

      <button type="button" onClick={onRemove} className="min-h-11 justify-self-end px-2 text-sm text-white/50 hover:text-red-300" aria-label="Remove step">
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

function ClockInput({ seconds, onChange, label }: { seconds: number; onChange: (s: number) => void; label: string }) {
  return (
    <input
      key={seconds}
      className={`${field} w-20`}
      defaultValue={clock(seconds)}
      placeholder="m:ss"
      aria-label={label}
      onBlur={(e) => {
        const s = parseClock(e.target.value);
        if (s > 0) onChange(s);
        else e.target.value = clock(seconds);
      }}
    />
  );
}

/** Swim distance in the pool's unit (yd or m); stored in metres. */
function SwimDistanceInput({ meters, pool, onChange }: { meters: number; pool: Pool; onChange: (m: number) => void }) {
  const perUnit = pool?.unit === "YARD" ? YARD : 1;
  const unit = pool?.unit === "YARD" ? "yd" : "m";
  return (
    <div className="flex items-center gap-1 text-sm text-white/50">
      <input
        key={`${meters}${unit}`}
        className={`${field} w-20`}
        defaultValue={Math.round(meters / perUnit)}
        inputMode="numeric"
        aria-label={`Distance in ${unit}`}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (v > 0) onChange(Number((v * perUnit).toFixed(2)));
        }}
      />
      {unit}
    </div>
  );
}

function SwimStepEditor({
  step,
  set,
  onRemove,
  pool,
}: {
  step: Extract<UiStep, { kind: "step" }>;
  set: (patch: Partial<Extract<UiStep, { kind: "step" }>>) => void;
  onRemove: () => void;
  pool: Pool;
}) {
  const d = step.duration;
  const t = step.target;
  const rest = step.intensity === "REST";
  const per = pool?.unit === "YARD" ? "yd" : "m";

  return (
    <div className="grid gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.05] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={sel}
          value={step.intensity}
          aria-label="Step type"
          onChange={(e) => {
            const intensity = e.target.value as Intensity;
            if ((intensity === "REST") === rest) return set({ intensity });
            // Switching between rest and swimming changes what the step needs.
            const fresh = newSwimStep(intensity, pool) as Extract<UiStep, { kind: "step" }>;
            set({ intensity, duration: fresh.duration, stroke: fresh.stroke, drill: undefined, equipment: undefined, target: undefined });
          }}
        >
          {SWIM_INTENSITIES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>

        {rest ? (
          <>
            <select
              className={sel}
              aria-label="Rest type"
              value={d.type}
              onChange={(e) => {
                const v = e.target.value;
                set({ duration: v === "sendoff" ? { type: "sendoff", seconds: 105 } : v === "open" ? { type: "open" } : { type: "time", seconds: 20 } });
              }}
            >
              <option value="time">Rest at the wall</option>
              <option value="sendoff" disabled={!pool}>
                Send-off{pool ? "" : " (pick a pool)"}
              </option>
              <option value="open">Until lap</option>
            </select>
            {(d.type === "time" || d.type === "sendoff") && (
              <ClockInput seconds={d.seconds} label={d.type === "sendoff" ? "Send-off (m:ss)" : "Rest (m:ss)"} onChange={(sec) => set({ duration: { ...d, seconds: sec } })} />
            )}
          </>
        ) : (
          <>
            <select
              className={sel}
              aria-label="Length of step"
              value={d.type === "sendoff" ? "distance" : d.type}
              onChange={(e) => {
                const v = e.target.value;
                set({ duration: v === "time" ? { type: "time", seconds: 300 } : v === "open" ? { type: "open" } : { type: "distance", meters: hundredMeters(pool) } });
              }}
            >
              <option value="distance">Distance</option>
              <option value="time">Time (1–59 min)</option>
              <option value="open">Until lap</option>
            </select>
            {d.type === "distance" && <SwimDistanceInput meters={d.meters} pool={pool} onChange={(m) => set({ duration: { type: "distance", meters: m } })} />}
            {d.type === "time" && <ClockInput seconds={d.seconds} label="Time (m:ss)" onChange={(sec) => set({ duration: { type: "time", seconds: sec } })} />}
          </>
        )}

        <button type="button" onClick={onRemove} className="ml-auto min-h-11 px-2 text-sm text-white/50 hover:text-red-300" aria-label="Remove step">
          Remove
        </button>
      </div>

      {!rest && (
        <div className="flex flex-wrap items-center gap-2">
          <select className={sel} aria-label="Stroke" value={step.stroke ?? "CHOICE"} onChange={(e) => set({ stroke: e.target.value as Stroke })}>
            {Object.entries(STROKES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select className={sel} aria-label="Drill" value={step.drill ?? ""} onChange={(e) => set({ drill: (e.target.value || undefined) as Drill | undefined })}>
            <option value="">Full stroke</option>
            {Object.entries(DRILLS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            className={sel}
            aria-label="Equipment"
            value={step.equipment ?? ""}
            onChange={(e) => set({ equipment: (e.target.value || undefined) as Equipment | undefined })}
          >
            <option value="">No equipment</option>
            {Object.entries(EQUIPMENT).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            className={sel}
            aria-label="Target"
            value={t?.type ?? "none"}
            onChange={(e) => {
              const v = e.target.value;
              set({ target: v === "swim_effort" ? { type: "swim_effort", level: 4 } : v === "swim_pace" ? { type: "swim_pace", secPer100: 105 } : undefined });
            }}
          >
            <option value="none">No target</option>
            <option value="swim_effort">Effort</option>
            <option value="swim_pace" disabled={!pool}>
              Pace per 100{pool ? "" : " (pick a pool)"}
            </option>
          </select>
          {t?.type === "swim_effort" && (
            <select className={sel} aria-label="Effort" value={t.level} onChange={(e) => set({ target: { type: "swim_effort", level: Number(e.target.value) as SwimEffort } })}>
              {Object.entries(SWIM_EFFORTS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
          {t?.type === "swim_pace" && (
            <span className="flex items-center gap-1 text-sm text-white/50">
              <ClockInput seconds={t.secPer100} label={`Pace per 100 ${per} (m:ss)`} onChange={(sec) => set({ target: { type: "swim_pace", secPer100: sec } })} />
              /100{per}
            </span>
          )}
        </div>
      )}

      <input
        className={field}
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
      {/* Fastest first, then slowest: reads like "7:30 to 8:00 per mile". */}
      <input key={`f${unit}`} className={`${field} w-16`} defaultValue={show(fast)} aria-label="Fastest pace" onBlur={(e) => onChange(slow, read(e.target.value) || fast)} />–
      <input key={`s${unit}`} className={`${field} w-16`} defaultValue={show(slow)} aria-label="Slowest pace" onBlur={(e) => onChange(read(e.target.value) || slow, fast)} />
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
  startSport = "run",
  units = "mi",
  mode = "coach",
  hasCoach = true,
}: {
  // athlete: their own builder. No AI; saves to My workouts and asks the coach to add it.
  mode?: "coach" | "athlete";
  hasCoach?: boolean;
  startSport?: Sport;
  units?: "mi" | "km";
  athleteId: string;
  athleteName: string;
  device: "garmin" | "apple" | null;
  initial?: { id: string; title: string; sport: Sport; scheduledDate: string; description: string | null; steps: Step[]; status: string; pool?: Pool; why?: string | null };
}) {
  const router = useRouter();
  const [id, setId] = useState(initial?.id);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [sport, setSport] = useState<Sport>(initial?.sport ?? startSport);
  // Tomorrow in the coach's local time (en-CA formats as YYYY-MM-DD).
  const [date, setDate] = useState(() => initial?.scheduledDate ?? new Date(Date.now() + 86400_000).toLocaleDateString("en-CA"));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [why, setWhy] = useState(initial?.why ?? "");
  const [drafting, startDraft] = useTransition();
  const [whyNote, setWhyNote] = useState<string | null>(null);
  const [steps, setSteps] = useState<UiStep[]>(() =>
    withIds(initial?.steps ?? (startSport === "swim" ? swimDefault({ length: 25, unit: "YARD" }) : DEFAULT_STEPS)),
  );
  const [paceUnit, setPaceUnit] = useState<"mi" | "km">(units);
  const [pool, setPool] = useState<Pool>(initial ? (initial.pool ?? null) : { length: 25, unit: "YARD" });
  const swim = sport === "swim";
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const athleteMode = mode === "athlete";
  const editable = athleteMode || !initial || initial.status === "draft";

  // Describe it: Claude turns the coach's words into steps that fill this builder for review.
  const [prompt, setPrompt] = useState("");
  const [building, startBuild] = useTransition();
  const [built, setBuilt] = useState<{ note: string | null; cost: number; undo: { title: string; sport: Sport; steps: UiStep[]; description: string } } | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const buildIt = () =>
    startBuild(async () => {
      setBuildError(null);
      const r = await buildWorkoutFromPrompt({ athleteId, prompt, sport, paceUnit, pool: sport === "swim" ? pool : pool ?? { length: 25, unit: "YARD" } });
      if (!r.ok) return setBuildError(r.error);
      setBuilt({ note: r.assumptions, cost: r.costUsd, undo: { title, sport, steps, description } });
      setTitle(r.title);
      setSport(r.sport);
      setSteps(withIds(r.steps));
      if (r.description) setDescription(r.description);
      navigator.vibrate?.([8, 30, 8]);
    });
  const mine = () => ({ id, title, sport, description, steps: stripIds(steps), pool: swim ? pool : null });
  const input = (): WorkoutInput => ({ id, athleteId, title, sport, scheduledDate: date, description, steps: stripIds(steps), pool: swim ? pool : null, why });
  const draftTheWhy = () =>
    startDraft(async () => {
      setWhyNote(null);
      const r = await draftWhyForBuilder({ athleteId, title, sport, scheduledDate: date, description, steps: stripIds(steps), pool: swim ? pool : null });
      if (!r.ok) return setWhyNote(r.error);
      setWhy(r.draft);
      setWhyNote(`AI draft (${r.costUsd < 0.01 ? "under 1¢" : `${(r.costUsd * 100).toFixed(1)}¢`}). Edit it as you like; ${athleteName} sees it once you send the workout.`);
    });

  // Switching sport on an untouched starter workout swaps in that sport's starter.
  const changeSport = (next: Sport) => {
    const current = JSON.stringify(stripIds(steps));
    const untouched = current === JSON.stringify(DEFAULT_STEPS) || current === JSON.stringify(swimDefault(pool));
    setSport(next);
    if (untouched) setSteps(withIds(next === "swim" ? swimDefault(pool) : DEFAULT_STEPS));
  };

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
      {editable && !athleteMode && (
        <section className="rounded-2xl border border-amber-200/20 bg-amber-200/[0.04] p-3">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <Sparkles size={15} className="text-amber-200" aria-hidden /> Describe it
            </span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && prompt.trim() && !building) {
                  e.preventDefault();
                  buildIt();
                }
              }}
              rows={2}
              maxLength={1500}
              placeholder={
                sport === "swim"
                  ? "e.g. 300 easy free, 8 x 50 kick on 1:10, 4 x 100 pull at 1:30 pace with 15 s rest, 200 cooldown"
                  : sport === "bike"
                    ? "e.g. 15 min easy, 3 x 10 min at 92-95% FTP with 5 min easy, 10 min cooldown"
                    : "e.g. 15 min easy, 6 x 800 m at 5K pace with 2 min jog, 10 min cooldown"
              }
              className={`${field} min-h-16 w-full`}
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={buildIt}
              disabled={building || !prompt.trim()}
              className="flex min-h-11 items-center gap-2 rounded-full bg-amber-200 px-5 text-sm font-medium text-black transition hover:bg-amber-100 disabled:opacity-50"
            >
              <Sparkles size={15} className={building ? "animate-pulse" : ""} /> {building ? "Building…" : "Build workout"}
            </button>
            {built && (
              <button
                type="button"
                onClick={() => {
                  setTitle(built.undo.title);
                  setSport(built.undo.sport);
                  setSteps(built.undo.steps);
                  setDescription(built.undo.description);
                  setBuilt(null);
                }}
                className="min-h-11 rounded-full px-4 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white"
              >
                Undo
              </button>
            )}
            <span className="text-xs text-white/45">Fills the builder below for you to check. Nothing is saved or sent.</span>
          </div>
          {built && (
            <p className="mt-2 text-xs text-white/60" aria-live="polite">
              {`Built (${built.cost < 0.01 ? "under 1¢" : `${(built.cost * 100).toFixed(1)}¢`}). Check each step below.${built.note ? ` Note: ${built.note}` : ""}`}
            </p>
          )}
          {buildError && (
            <p role="alert" className="mt-2 text-sm text-red-200">
              {buildError}
            </p>
          )}
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <input className={field} placeholder="Workout title, e.g. 4 × 3 min threshold" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} maxLength={100} />
        <select className={sel} value={sport} onChange={(e) => changeSport(e.target.value as Sport)} disabled={!editable} aria-label="Sport">
          <option value="run">Run</option>
          <option value="bike">Bike</option>
          <option value="swim">Swim</option>
        </select>
        <input className={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!editable} />
      </div>
      <textarea
        className={`${field} min-h-20`}
        placeholder={athleteMode ? "Notes (optional)" : "Description for the athlete (optional)"}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={!editable}
        maxLength={1024}
      />
      {editable && !athleteMode && (
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">Why this workout</span>
            <button
              type="button"
              onClick={draftTheWhy}
              disabled={drafting}
              className="flex min-h-10 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 text-sm text-white/80 transition hover:bg-white/[0.09] disabled:opacity-60"
            >
              <Sparkles size={14} className={drafting ? "animate-pulse text-amber-200" : "text-amber-200"} />
              {drafting ? "Drafting…" : why.trim() ? "Redraft with AI" : "Draft with AI"}
            </button>
          </div>
          <textarea
            className={`${field} min-h-16 w-full`}
            value={why}
            onChange={(e) => {
              setWhy(e.target.value);
              setWhyNote(null);
            }}
            maxLength={400}
            placeholder={`What this session is for, in a sentence or two. ${athleteName} sees it with the workout.`}
            aria-label="Why this workout"
          />
          {whyNote && <p className="mt-1 text-xs text-white/55">{whyNote}</p>}
        </div>
      )}

      {/* Live totals: stays in view while the steps below are edited. */}
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-30 md:top-2">
        <WorkoutSummary steps={stripIds(steps)} sport={sport} pool={swim ? pool : null} units={paceUnit} className="bg-canvas/90 backdrop-blur-xl" />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Steps</h2>
        {swim && (
          <label className="flex items-center gap-2 text-xs text-white/60">
            Pool
            <select
              className={sel}
              value={poolKey(pool)}
              disabled={!editable}
              onChange={(e) => {
                const next = POOLS.find((p) => p.key === e.target.value)?.pool ?? null;
                // Keep the same number of lengths' worth of distance in the new unit (100 yd -> 100 m).
                const factor = hundredMeters(next) / hundredMeters(pool);
                const rescale = (list: UiStep[]): UiStep[] =>
                  list.map((s) =>
                    s.kind === "repeat"
                      ? { ...s, steps: rescale(s.steps) }
                      : s.duration.type === "distance"
                        ? { ...s, duration: { type: "distance", meters: Number((s.duration.meters * factor).toFixed(2)) } }
                        : s,
                  );
                if (factor !== 1) setSteps(rescale(steps));
                setPool(next);
              }}
            >
              {POOLS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {sport === "run" && (
          <label className="flex items-center gap-2 text-xs text-white/60">
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
            <StepEditor key={s.uid} step={s} paceUnit={paceUnit} swim={swim} pool={pool} onChange={(n) => setSteps(updateAt(steps, i, n))} onRemove={() => setSteps(steps.filter((_, j) => j !== i))} />
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
                <button type="button" className="min-h-11 px-2 text-sm text-white/50 hover:text-red-300" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
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
                      swim={swim}
                      pool={pool}
                      onChange={(n) => setSteps(updateAt(steps, i, { ...s, steps: updateAt(s.steps, k, n) }))}
                      onRemove={() => setSteps(updateAt(steps, i, { ...s, steps: s.steps.filter((_, j) => j !== k) }))}
                    />
                  ) : null,
                )}
                <button
                  type="button"
                  className="min-h-11 justify-self-start text-sm text-emerald-200/80 hover:underline"
                  onClick={() => setSteps(updateAt(steps, i, { ...s, steps: [...s.steps, swim ? newSwimStep("REST", pool) : newStep("RECOVERY")] }))}
                >
                  + Step inside repeat
                </button>
              </div>
            </div>
          ),
        )}
        <div className="flex gap-4">
          <button type="button" className="min-h-11 text-sm text-emerald-200/80 hover:underline" onClick={() => setSteps([...steps, swim ? newSwimStep("MAIN", pool) : newStep()])}>
            + Step
          </button>
          <button
            type="button"
            className="min-h-11 text-sm text-emerald-200/80 hover:underline"
            onClick={() =>
              setSteps([
                ...steps,
                {
                  uid: uid(),
                  kind: "repeat",
                  times: 4,
                  steps: swim ? [newSwimStep("MAIN", pool), newSwimStep("REST", pool)] : [newStep("INTERVAL"), newStep("RECOVERY")],
                },
              ])
            }
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

      {athleteMode ? (
        <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
          <button
            disabled={pending}
            onClick={() => run(() => saveMyWorkout(mine()))}
            className="min-h-12 rounded-2xl border border-white/15 bg-white/[0.05] px-5 text-sm font-medium hover:bg-white/[0.1] disabled:opacity-50"
          >
            Save to My workouts
          </button>
          {hasCoach && (
            <button
              disabled={pending}
              onClick={() =>
                // The request's id is a calendar entry, not this library workout: don't keep it.
                run(async () => {
                  const r = await requestWorkout({ ...mine(), id: undefined, date });
                  return r.ok ? { ok: true, message: r.message } : r;
                })
              }
              className="min-h-12 rounded-2xl bg-emerald-300 px-5 text-sm font-medium text-black transition active:scale-[0.98] disabled:opacity-50"
            >
              Ask coach to add it on {new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </button>
          )}
        </div>
      ) : editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={pending}
            onClick={() => run(() => saveDraft(input()))}
            className="min-h-12 rounded-2xl border border-white/15 bg-white/[0.05] px-5 text-sm font-medium hover:bg-white/[0.1] disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            disabled={pending}
            onClick={() => setConfirming(true)}
            className="min-h-12 rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 text-sm font-medium text-emerald-100 hover:bg-emerald-300/20 disabled:opacity-50"
          >
            Approve & send…
          </button>
          {id && (
            <button
              disabled={pending}
              onClick={() => run(() => deleteDraft(id, athleteId), () => router.push(`/athlete/${athleteId}`))}
              className="ml-auto min-h-11 text-sm text-white/50 hover:text-red-300"
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
          <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-panel p-6">
            <h3 className="text-lg font-medium">Send this workout?</h3>
            <p className="mt-2 text-sm text-white/60">
              <strong className="text-white">{title || "Untitled"}</strong> ({sport}) on{" "}
              {new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} → {destination}
            </p>
            <WorkoutSummary steps={stripIds(steps)} sport={sport} pool={swim ? pool : null} units={paceUnit} className="mt-4" />
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-white/70">
              {describe(stripIds(steps), paceUnit, swim ? pool : null, swim).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
            {swim && steps.some((s) => s.kind === "repeat" && s.steps.some((c) => c.kind === "step" && c.intensity === "REST")) && (
              <p className="mt-3 text-xs text-white/50">On the watch, the rest after the last rep of each repeat is skipped (Garmin&apos;s swim default).</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirming(false)} className="min-h-12 rounded-2xl px-4 text-sm text-white/60 hover:text-white">
                Cancel
              </button>
              <button
                disabled={pending}
                onClick={() => run(() => approveAndSend(input()), () => setConfirming(false))}
                className="min-h-12 rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 text-sm font-medium text-emerald-100 hover:bg-emerald-300/25 disabled:opacity-50"
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

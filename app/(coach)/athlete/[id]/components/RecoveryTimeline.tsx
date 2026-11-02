import type { AthleteHistoryPoint } from "@/types/athlete";

import {
  scoreToTone,
  toneToBgColor,
  toneToBorderGlow,
  toneToTextColor,
} from "@/lib/status";

export default function RecoveryTimeline({
  history,
}: {
  history: AthleteHistoryPoint[];
}) {
  return (
    <section className="mt-8 rounded-[36px] border border-white/10 bg-white/[0.035] p-7 backdrop-blur-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-white/35">
            Recovery Timeline
          </p>

          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Seven-Day Physiological Drift
          </h2>
        </div>

        <p className="text-sm text-white/45">
          Adaptive trend view
        </p>
      </div>

      <div className="mt-10 grid grid-cols-7 gap-3">
        {history.map((item) => {
          const tone = scoreToTone(item.readiness);

          return (
            <div
              key={item.day}
              className="flex flex-col items-center gap-3"
            >
              <div
                className={`relative flex h-28 w-full items-end justify-center rounded-2xl border bg-[#0b0b0b]/90 p-2 ${toneToBorderGlow(
                  tone
                )}`}
              >
                <div
                  className={`w-full rounded-xl ${toneToBgColor(tone)}`}
                  style={{
                    height: `${item.readiness}%`,
                  }}
                />
              </div>

              <p className="text-xs text-white/40">
                {item.day}
              </p>

              <p
                className={`text-sm font-semibold ${toneToTextColor(
                  tone
                )}`}
              >
                {item.readiness}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <TimelineSummary
          label="HRV Range"
          value={`${Math.min(
            ...history.map((item) => item.hrv)
          )}–${Math.max(...history.map((item) => item.hrv))}`}
        />

        <TimelineSummary
          label="Sleep Range"
          value={`${Math.min(
            ...history.map((item) => item.sleep)
          )}–${Math.max(...history.map((item) => item.sleep))}h`}
        />

        <TimelineSummary
          label="Strain Range"
          value={`${Math.min(
            ...history.map((item) => item.strain)
          )}–${Math.max(...history.map((item) => item.strain))}`}
        />
      </div>
    </section>
  );
}

function TimelineSummary({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0b0b]/90 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-white/35">
        {label}
      </p>

      <p className="mt-3 text-xl font-semibold text-white/75">
        {value}
      </p>
    </div>
  );
}
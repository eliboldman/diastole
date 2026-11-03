type Tone = "green" | "yellow" | "red" | "blue" | null;

type Props = {
  stressOpacity?: number;
  focusTone?: Tone;
  variant?: "atmosphere" | "neural";
  systemTone?: Tone;
};

export default function PhysiologyBackground({
  stressOpacity = 0.08,
  focusTone = null,
  systemTone = null,
  variant = "atmosphere",
}: Props) {
  const activeTone = focusTone ?? systemTone ?? "red";

  const tone =
    activeTone === "green"
      ? "rgba(74,222,128,"
      : activeTone === "yellow"
        ? "rgba(253,186,116,"
        : activeTone === "blue"
          ? "rgba(125,211,252,"
          : "rgba(248,113,113,";

  if (variant === "neural") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <svg className="absolute inset-0 h-full w-full">
          <defs>
            <filter id="neuralBlur">
              <feGaussianBlur stdDeviation="18" />
            </filter>
          </defs>

          <g filter="url(#neuralBlur)">
            <path
              d="M-100 220 C 180 120, 320 340, 620 240 S 1040 160, 1400 260"
              stroke={`${tone}${stressOpacity})`}
              strokeWidth="22"
              fill="none"
              className="neural-flow-slow"
            />

            <path
              d="M-80 520 C 220 420, 420 660, 720 540 S 1100 460, 1480 620"
              stroke={`${tone}${stressOpacity * 0.8})`}
              strokeWidth="18"
              fill="none"
              className="neural-flow"
            />

            <circle
              cx="760"
              cy="540"
              r="16"
              fill={`${tone}${stressOpacity * 1.8})`}
              className="neural-node-pulse"
            />

            <circle
              cx="1120"
              cy="260"
              r="20"
              fill={`${tone}${stressOpacity * 1.9})`}
              className="neural-node-pulse-slow"
            />
          </g>
        </svg>
      </div>
    );
  }

  // Breathing clouds: soft radial gradients (no blur filter, so phones stay smooth) that swell
  // and settle about six times a minute, each slightly out of phase, while drifting very slowly.
  const primary =
    activeTone === "green"
      ? "74,222,128"
      : activeTone === "yellow"
        ? "253,186,116"
        : activeTone === "blue"
          ? "125,211,252"
          : "248,113,113";
  const o = Math.min(1, stressOpacity * 3.2);
  const clouds = [
    { rgb: primary, a: 0.55 * o, size: "46rem", pos: "left-[-14%] top-[-18%]", drift: "cloud-drift-a", delay: "0s" },
    { rgb: "125,211,252", a: 0.32 * o, size: "38rem", pos: "right-[-16%] top-[12%]", drift: "cloud-drift-b", delay: "-3.3s" },
    { rgb: "45,212,191", a: 0.3 * o, size: "52rem", pos: "left-[22%] bottom-[-30%]", drift: "cloud-drift-c", delay: "-6.6s" },
    { rgb: "253,224,200", a: 0.12 * o, size: "30rem", pos: "right-[8%] bottom-[-8%]", drift: "cloud-drift-a", delay: "-1.7s" },
  ];

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {clouds.map((c, i) => (
        <div key={i} className={`absolute ${c.pos} ${c.drift}`} style={{ width: c.size, height: c.size }}>
          <div
            className="cloud-breathe h-full w-full rounded-full"
            style={{
              background: `radial-gradient(closest-side, rgba(${c.rgb},${c.a.toFixed(3)}), rgba(${c.rgb},${(c.a * 0.35).toFixed(3)}) 55%, transparent)`,
              animationDelay: c.delay,
            }}
          />
        </div>
      ))}
      <div className="absolute inset-0 opacity-[0.03] neural-grid" />
    </div>
  );
}
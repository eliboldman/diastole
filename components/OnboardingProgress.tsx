const STEPS = ["Create account", "Connect watch", "Done"];

/** Three-step progress bar for new athletes: 1 = choosing a password, 2 = connecting a watch, 3 = all set. */
export default function OnboardingProgress({ step }: { step: 1 | 2 | 3 }) {
  const pct = ((step - 1) / (STEPS.length - 1)) * 100;
  return (
    <div className="mb-10" aria-label={`Setup step ${step} of ${STEPS.length}: ${STEPS[step - 1]}`}>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="onboarding-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-300/70 to-teal-200"
          style={{ width: `${Math.max(pct, 6)}%` }}
        />
      </div>
      <ol className="mt-3 grid grid-cols-3 text-xs">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step || step === 3;
          const current = n === step && step !== 3;
          return (
            <li
              key={label}
              className={`flex items-center gap-1.5 ${i === 1 ? "justify-center" : i === 2 ? "justify-end" : ""} ${
                current ? "text-white" : done ? "text-emerald-200/80" : "text-white/45"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                  done ? "bg-emerald-300/90 text-emerald-950" : current ? "border border-emerald-200/60 text-emerald-100" : "border border-white/20"
                }`}
              >
                {done ? "✓" : n}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

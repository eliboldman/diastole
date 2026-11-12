// Diastole's own boss creatures: round, soft and a bit silly. As health drops they get dizzier
// (swirly eyes, a wobble, a sweat drop), and a beaten boss naps with a little flag.
import type { Limiter } from "@/lib/bosses/bosses";

type Mood = "fresh" | "hurt" | "dizzy" | "beaten";
export const moodFor = (left: number, hp: number, defeated = false): Mood => (defeated ? "beaten" : left / hp > 0.6 ? "fresh" : left / hp > 0.25 ? "hurt" : "dizzy");

function Eyes({ cx, cy, gap, mood, color = "#1f2937" }: { cx: number; cy: number; gap: number; mood: Mood; color?: string }) {
  const at = [cx - gap, cx + gap];
  if (mood === "beaten")
    return (
      <>
        {at.map((x) => (
          <path key={x} d={`M${x - 5} ${cy}q5 4 10 0`} stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        ))}
      </>
    );
  if (mood === "dizzy")
    return (
      <>
        {at.map((x) => (
          <path key={x} d={`M${x} ${cy}m-5 0a5 5 0 1 1 5 5a3 3 0 1 1 -3 -3`} stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        ))}
      </>
    );
  return (
    <>
      {at.map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={cy} rx="4.6" ry={mood === "hurt" ? 3.4 : 5.4} fill={color} />
          <circle cx={x + 1.6} cy={cy - 1.8} r="1.5" fill="#fff" />
        </g>
      ))}
    </>
  );
}

function Mouth({ cx, cy, mood }: { cx: number; cy: number; mood: Mood }) {
  if (mood === "fresh") return <path d={`M${cx - 7} ${cy}q7 6 14 0`} stroke="#1f2937" strokeWidth="2.4" fill="none" strokeLinecap="round" />;
  if (mood === "hurt") return <path d={`M${cx - 6} ${cy + 2}h12`} stroke="#1f2937" strokeWidth="2.4" strokeLinecap="round" />;
  if (mood === "dizzy") return <path d={`M${cx - 7} ${cy + 3}q3.5 -4 7 0t7 0`} stroke="#1f2937" strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  return <ellipse cx={cx} cy={cy + 2} rx="3" ry="2" fill="#1f2937" />;
}

const Sweat = ({ x, y }: { x: number; y: number }) => <path d={`M${x} ${y}q4 6 0 9q-4 -3 0 -9z`} fill="#7dd3fc" />;
const Zzz = ({ x, y }: { x: number; y: number }) => (
  <text x={x} y={y} fontSize="11" fontWeight="700" fill="#e2e8f0" opacity=".8" fontFamily="system-ui">
    z z
  </text>
);

export default function BossArt({ limiter, mood, size = 120 }: { limiter: Limiter; mood: Mood; size?: number }) {
  const wobble = mood === "dizzy" ? "boss-wobble" : mood === "beaten" ? "" : "boss-bob";
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`${limiter} boss`} className="shrink-0 overflow-visible">
      <ellipse cx="60" cy="108" rx="34" ry="6" fill="#000" opacity=".3" />
      <g className={wobble} style={{ transformOrigin: "60px 100px" }}>
        {limiter === "fade" && (
          // The Fizzle: a round candle-blob with a flame that shrinks as it loses.
          <>
            <path d={`M60 ${mood === "fresh" ? 6 : mood === "hurt" ? 16 : 26}c10 12 14 20 6 30-4 5-14 5-17-2-4-9 5-16 11-28z`} fill="#fb923c" opacity={mood === "beaten" ? 0.2 : 1} />
            <path d={`M60 ${mood === "fresh" ? 22 : mood === "hurt" ? 30 : 38}c5 7 6 11 2 16-3 3-8 2-9-2-1-5 3-8 7-14z`} fill="#fde68a" opacity={mood === "beaten" ? 0.2 : 1} />
            <rect x="30" y="50" width="60" height="54" rx="26" fill="#fef3c7" />
            <path d="M34 62c8 4 14-2 22 2s14 2 22-2 10 2 10 2" stroke="#fde68a" strokeWidth="5" fill="none" strokeLinecap="round" />
            <Eyes cx={60} cy={76} gap={12} mood={mood} />
            <Mouth cx={60} cy={90} mood={mood} />
          </>
        )}
        {limiter === "climbing" && (
          // Grumblehill: a sleepy hill with a tuft of grass and grumpy brows.
          <>
            <path d="M10 104C18 60 40 30 60 30s42 30 50 74z" fill="#65a30d" />
            <path d="M24 104C30 74 44 52 60 52s30 22 36 52z" fill="#84cc16" opacity=".55" />
            <path d="M52 30l4-10 4 8 4-9 3 11" stroke="#bef264" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {mood !== "beaten" && <path d="M38 60l12 4M82 60l-12 4" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" />}
            <Eyes cx={60} cy={70} gap={12} mood={mood} />
            <Mouth cx={60} cy={86} mood={mood} />
            <circle cx="30" cy="92" r="3" fill="#fef08a" />
            <circle cx="92" cy="96" r="2.5" fill="#f9a8d4" />
          </>
        )}
        {limiter === "swim" && (
          // Puddlewump: a wobbly blob of pool water with a bubble on its head.
          <>
            <path d="M18 98c-6-30 10-60 42-60s48 30 42 60c-2 8-14 8-20 4-6 4-14 4-22 0-8 4-16 4-22 0-6 4-18 4-20-4z" fill="#38bdf8" />
            <path d="M30 62c6-10 16-14 26-14" stroke="#e0f2fe" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".8" />
            <circle cx="74" cy="28" r="7" fill="none" stroke="#bae6fd" strokeWidth="2.5" />
            <circle cx="86" cy="18" r="4" fill="none" stroke="#bae6fd" strokeWidth="2" />
            <Eyes cx={60} cy={70} gap={13} mood={mood} color="#0c4a6e" />
            <Mouth cx={60} cy={86} mood={mood} />
          </>
        )}
        {limiter === "consistency" && (
          // Snoozlet: a cozy cloud in a striped nightcap.
          <>
            <path d="M26 100a18 18 0 0 1 2-36 22 22 0 0 1 40-14 18 18 0 0 1 28 14 18 18 0 0 1-2 36z" fill="#e2e8f0" />
            <path d="M46 44c6-22 30-28 46-18l-8 12c-10-4-22-2-30 10z" fill="#a78bfa" />
            <path d="M58 32l8 6m6-12l6 8" stroke="#ede9fe" strokeWidth="3" strokeLinecap="round" />
            <circle cx="94" cy="24" r="6" fill="#fde68a" />
            <Eyes cx={58} cy={76} gap={12} mood={mood === "fresh" ? "beaten" : mood} color="#334155" />
            <Mouth cx={58} cy={90} mood={mood} />
          </>
        )}
        {(mood === "hurt" || mood === "dizzy") && <Sweat x={limiter === "climbing" ? 88 : 90} y={58} />}
      </g>
      {mood === "beaten" && (
        <>
          <Zzz x={84} y={46} />
          <path d="M96 104V70" stroke="#e2e8f0" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M96 70l16 6-16 6z" fill="var(--color-emerald-300)" />
        </>
      )}
    </svg>
  );
}

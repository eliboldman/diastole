/**
 * The Diastole mark (ring + heartbeat), drawn in the theme's accent so it changes with the theme.
 * Same shape as public/logo.png, which stays for icons and anywhere outside the app.
 */
export default function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Diastole" className={`shrink-0 text-emerald-300 ${className}`}>
      <rect width="100" height="100" rx="22" fill="#060908" />
      {/* Soft glow behind the ring (no gradient ids, so several logos on one page never clash). */}
      <circle cx="51" cy="50" r="40" fill="currentColor" opacity="0.07" />
      <circle cx="51" cy="50" r="30" fill="currentColor" opacity="0.06" />
      <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 3px color-mix(in oklab, currentColor 70%, transparent))" }}>
        <path d="M19.3 59 A32 32 0 1 1 31.6 76.2" />
        <path d="M19.3 59 H39.5 L45 33 L52 65 L57 53 H70" />
      </g>
    </svg>
  );
}

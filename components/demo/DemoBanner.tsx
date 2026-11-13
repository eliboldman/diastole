import { backToCoach } from "@/lib/demo/actions";

/** Shown while a coach is inside their demo athlete's account. */
export default function DemoBanner() {
  return (
    <form action={backToCoach} className="relative z-40 mx-auto mb-4 flex max-w-6xl items-center justify-between gap-3 rounded-2xl border border-sky-300/30 bg-sky-300/[0.10] px-4 py-2 text-sm text-sky-50">
      <span>You&apos;re using the app as your demo athlete.</span>
      <button className="min-h-10 shrink-0 rounded-xl bg-sky-200 px-3 font-semibold text-sky-950 active:scale-95">Back to coach</button>
    </form>
  );
}

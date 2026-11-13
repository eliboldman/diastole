import { openDemoAthlete } from "@/lib/demo/actions";

/** On a demo athlete's page: step into their account to try the athlete side. */
export default function OpenDemoButton({ athleteId, name }: { athleteId: string; name: string }) {
  return (
    <form action={openDemoAthlete.bind(null, athleteId)} className="mt-4 flex flex-wrap items-center gap-3 rounded-[24px] border border-sky-300/25 bg-sky-300/[0.08] px-5 py-4">
      <p className="min-w-0 flex-1 text-sm text-white/80">
        {name} is a demo athlete with sample data. Try the athlete side: log meals, check in, open workouts.
      </p>
      <button className="min-h-11 rounded-2xl bg-sky-200 px-4 text-sm font-semibold text-sky-950 active:scale-95">Use the app as {name.split(" ")[0]}</button>
    </form>
  );
}

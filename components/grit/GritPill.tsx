import Link from "next/link";

import { GritMark } from "@/components/grit/Art";

/** Grit balance in the top bar on every athlete page: one tap to the Grit bank and store. */
export default function GritPill({ balance, active = false }: { balance: number; active?: boolean }) {
  return (
    <Link
      href="/me/grit#store"
      aria-label={`${balance.toLocaleString()} grit. Open the Grit bank and store`}
      aria-current={active ? "page" : undefined}
      className={`flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold tabular-nums text-emerald-50 transition active:scale-95 ${
        active ? "border-emerald-300/50 bg-emerald-300/[0.2]" : "border-emerald-300/25 bg-emerald-300/[0.08] hover:bg-emerald-300/[0.14]"
      }`}
    >
      <GritMark size={15} />
      {balance.toLocaleString()}
    </Link>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { dismissTip } from "@/lib/discovery-actions";

export default function DismissChecklist({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(async () => { await dismissTip(id); router.refresh(); })} className="mt-2 min-h-10 text-xs text-white/45 hover:text-white/70">
      Hide this list
    </button>
  );
}

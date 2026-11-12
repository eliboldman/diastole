"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setBaton } from "@/lib/baton/actions";

export default function BatonToggle({ podId, on }: { podId: string; on: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  return (
    <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 border-t border-white/[0.08] pt-3 text-sm">
      <input
        type="checkbox"
        checked={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setValue(next);
          start(async () => {
            const r = await setBaton(podId, next);
            if (!r.ok) setValue(!next);
            router.refresh();
          });
        }}
        className="h-5 w-5 accent-[var(--color-emerald-300)]"
      />
      <span className="text-white/75">
        I&apos;m in <span className="text-white/45">· the pod sees your name and when you finished, never what you did</span>
      </span>
    </label>
  );
}

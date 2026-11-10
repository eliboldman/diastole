"use client";

import { useState, useTransition } from "react";

import { saveAiSettings } from "@/lib/ai/actions";

const MODELS = [
  ["claude-opus-5-5", "Claude Opus 5.5 — most thoughtful (default)"],
  ["claude-sonnet-5-5", "Claude Sonnet 5.5 — about half the cost"],
  ["claude-haiku-5-5", "Claude Haiku 5.5 — cheapest, simpler suggestions"],
];

const field =
  "rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white focus:border-emerald-300/40 focus:outline-none";

export default function AiSettingsForm({ enabled, model, cap, spent }: { enabled: boolean; model: string; cap: number; spent: number }) {
  const [on, setOn] = useState(enabled);
  const [m, setM] = useState(model);
  const [c, setC] = useState(String(cap));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid w-full max-w-md grid-cols-[minmax(0,1fr)] gap-4">
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-5 w-5 accent-emerald-400" />
        Turn on the coaching assistant (you run it from Today with Review)
      </label>
      <label className="grid gap-2 text-sm text-white/60">
        Model
        <select className={`${field} bg-panel`} value={m} onChange={(e) => setM(e.target.value)}>
          {MODELS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm text-white/60">
        Monthly spending cap (USD)
        <input className={field} type="number" min={0} max={100} step={0.5} value={c} onChange={(e) => setC(e.target.value)} />
        <span className="text-xs text-white/50">
          ${spent.toFixed(2)} spent this month. The assistant stops for the rest of the month once the cap is reached.
        </span>
      </label>
      <div className="flex items-center gap-4">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveAiSettings({ enabled: on, model: m, cap: Number(c) });
              setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
            })
          }
          className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-5 py-3 font-medium text-emerald-100 hover:bg-emerald-300/20 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-200" : "text-red-300"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

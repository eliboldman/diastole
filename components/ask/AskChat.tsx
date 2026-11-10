"use client";

import { ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import Markdown from "@/components/ask/Markdown";

type Turn = { role: "user" | "assistant"; text: string; cost?: number; error?: boolean };

const STARTERS = [
  "Who looks under-recovered this week?",
  "How did everyone's key sessions go last week?",
  "Has anyone's resting heart rate crept up lately?",
  "Who's ramping up mileage fastest right now?",
];
const STORE = "d_ask";

/** Ask Diastole: questions about your athletes, answered from their real data. */
export default function AskChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // Keep this tab's conversation through a reload (this browser tab only).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "[]");
      if (Array.isArray(saved) && saved.length) setTurns(saved.filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string"));
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-30)));
    } catch {
      /* storage unavailable */
    }
  }, [turns]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, steps]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history = turns.filter((t) => !t.error).map(({ role, text }) => ({ role, text }));
    setTurns((t) => [...t, { role: "user", text: question }]);
    setDraft("");
    setBusy(true);
    setSteps([]);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, history }) });
      if (!res.ok || !res.body) throw new Error(res.status === 401 ? "You've been signed out. Sign in again." : "Couldn't reach Diastole.");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        buf += dec.decode(chunk.value ?? new Uint8Array(), { stream: !done });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as { t: string; text: string; cost?: number };
          if (ev.t === "step") setSteps((s) => (s[s.length - 1] === ev.text ? s : [...s, ev.text]));
          else if (ev.t === "answer") setTurns((t) => [...t, { role: "assistant", text: ev.text, cost: ev.cost }]);
          else if (ev.t === "error") setTurns((t) => [...t, { role: "assistant", text: ev.text, error: true }]);
        }
      }
    } catch (e) {
      setTurns((t) => [...t, { role: "assistant", text: e instanceof Error ? e.message : "Something went wrong.", error: true }]);
    } finally {
      setBusy(false);
      setSteps([]);
      box.current?.focus();
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col">
      <div className="flex-1 space-y-5">
        {turns.length === 0 && (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-white/65">Ask anything about your athletes. Diastole looks it up in their real workouts, recovery, check-ins and plans, and links what it finds.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)} className="min-h-10 rounded-full border border-white/10 px-3 text-left text-sm text-white/80 transition hover:bg-white/[0.06]">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-[22px] rounded-br-md bg-emerald-300/15 px-4 py-2.5 text-[15px] text-emerald-50">{t.text}</p>
            </div>
          ) : (
            <div key={i} className={`rounded-[22px] border p-4 ${t.error ? "border-red-300/20 bg-red-300/[0.05] text-red-100" : "border-white/10 bg-white/[0.04]"}`}>
              {t.error ? <p className="text-sm">{t.text}</p> : <Markdown text={t.text} />}
              {t.cost !== undefined && <p className="mt-3 text-[11px] text-white/35">{t.cost < 0.01 ? "under 1¢" : `${(t.cost * 100).toFixed(1)}¢`}</p>}
            </div>
          ),
        )}

        {busy && (
          <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4 text-sm text-white/60" aria-live="polite">
            <p className="flex items-center gap-2">
              <Sparkles size={15} className="animate-pulse text-emerald-200" aria-hidden /> {steps[steps.length - 1] ?? "Thinking"}…
            </p>
            {steps.length > 1 && (
              <ul className="mt-2 space-y-0.5 pl-6 text-xs text-white/40">
                {steps.slice(0, -1).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
        className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] mt-5 md:bottom-4"
      >
        <div className="flex items-end gap-2 rounded-[24px] border border-white/15 bg-canvas/90 p-2 backdrop-blur-xl">
          <textarea
            ref={box}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(draft);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder={turns.length ? "Ask a follow-up" : "Ask about your athletes"}
            aria-label="Your question"
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35"
          />
          {turns.length > 0 && !busy && (
            <button type="button" onClick={() => setTurns([])} aria-label="Start over" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/50 hover:bg-white/[0.06]">
              <RotateCcw size={17} />
            </button>
          )}
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Ask" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-300/20 text-emerald-50 transition hover:bg-emerald-300/30 disabled:opacity-40">
            <ArrowUp size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}

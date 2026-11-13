"use client";

import { BookmarkPlus, MessageSquareText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { setSavedReplies } from "@/lib/messages/replies";

/** Composer button: pick a saved reply to drop into the message, save the current text, or remove one. */
export default function SavedReplies({ initial, current, onPick }: { initial: string[]; current: string; onPick: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const save = (next: string[]) => {
    setList(next);
    void setSavedReplies(next);
  };
  const text = current.trim();
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Saved replies" aria-expanded={open} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.06] hover:text-white">
        <MessageSquareText size={19} />
      </button>
      {open && (
        <div className="absolute bottom-14 left-0 z-50 w-[min(22rem,85vw)] rounded-2xl border border-white/10 bg-panel/95 p-2 shadow-2xl backdrop-blur-2xl">
          <p className="px-2 py-1 text-xs uppercase tracking-[0.15em] text-white/45">Saved replies</p>
          {list.length === 0 && <p className="px-2 py-2 text-sm text-white/55">None yet. Type a message you send often, then save it here.</p>}
          <ul className="max-h-64 overflow-y-auto">
            {list.map((r, i) => (
              <li key={i} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onPick(r);
                    setOpen(false);
                  }}
                  className="min-h-11 min-w-0 flex-1 truncate rounded-xl px-2 text-left text-sm text-white/85 hover:bg-white/[0.06]"
                >
                  {r}
                </button>
                <button type="button" onClick={() => save(list.filter((_, j) => j !== i))} aria-label="Remove this saved reply" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/40 hover:bg-white/[0.06]">
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
          {text && !list.includes(text) && list.length < 30 && (
            <button type="button" onClick={() => save([...list, text.slice(0, 500)])} className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl border-t border-white/[0.08] px-2 text-sm text-emerald-200 hover:bg-white/[0.04]">
              <BookmarkPlus size={15} /> Save what I typed
            </button>
          )}
        </div>
      )}
    </div>
  );
}

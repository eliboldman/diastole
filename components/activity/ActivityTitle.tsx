"use client";

import { Check, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { renameActivity } from "@/lib/activity/rename";

/**
 * An activity's title with an inline rename for its owner or coach. Saving an empty name
 * goes back to the name the watch gave it. Garmin syncs won't overwrite a chosen name.
 */
export default function ActivityTitle({
  id,
  name,
  fallback,
  canRename,
  href,
  as: Tag = "h2",
  className = "",
}: {
  id: string;
  name: string | null;
  fallback: string;
  canRename: boolean;
  href?: string;
  as?: "h1" | "h2" | "h3";
  className?: string; // heading styles
}) {
  const router = useRouter();
  const [shown, setShown] = useState(name);
  const [base, setBase] = useState(name);
  // A refresh with a new server name replaces the local one.
  if (name !== base) {
    setBase(name);
    setShown(name);
  }
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const title = shown || fallback;

  const open = () => {
    setDraft(shown ?? "");
    setError(null);
    setEditing(true);
    requestAnimationFrame(() => input.current?.select());
  };
  const save = () =>
    start(async () => {
      if (draft.trim() === (shown ?? "")) return setEditing(false);
      const r = await renameActivity(id, draft);
      if (!r.ok) return setError(r.error);
      setShown(r.name);
      setEditing(false);
      router.refresh();
    });

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          ref={input}
          value={draft}
          maxLength={80}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          placeholder={`${fallback} (blank = watch's name)`}
          aria-label="Workout name"
          aria-invalid={Boolean(error)}
          className="min-h-11 min-w-0 flex-1 rounded-2xl border border-emerald-300/30 bg-white/[0.06] px-3 text-base font-medium text-white placeholder:text-white/35 focus:border-emerald-300/60 focus:outline-none"
        />
        <button type="submit" disabled={pending} aria-label="Save name" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-300/15 text-emerald-100 hover:bg-emerald-300/25 disabled:opacity-50">
          <Check size={18} />
        </button>
        <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/55 hover:bg-white/[0.06]">
          <X size={18} />
        </button>
        {error && (
          <span role="alert" className="basis-full text-xs text-red-200">
            {error}
          </span>
        )}
      </form>
    );
  }

  return (
    <Tag className={`flex min-w-0 items-start gap-1.5 ${className}`}>
      <span className="min-w-0 break-words">
        {href ? (
          <Link href={href} className="hover:text-emerald-100 hover:underline">
            {title}
          </Link>
        ) : (
          title
        )}
      </span>
      {canRename && (
        <button
          type="button"
          onClick={open}
          aria-label="Rename workout"
          title="Rename"
          className="-my-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/35 transition hover:bg-white/[0.06] hover:text-white/80 focus-visible:text-white/80"
        >
          <Pencil size={15} />
        </button>
      )}
    </Tag>
  );
}

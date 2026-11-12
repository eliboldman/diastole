"use client";

import { Camera, Loader2, Minus, Plus, ScanBarcode, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import EatenPicker from "@/components/fuel/EatenPicker";
import type { EatenAt } from "@/lib/fuel/eaten";
import { saveMeal } from "@/lib/fuel/meal-actions";
import { confirmItem, rangeText, scaleLabel, stepScale, totals, type EstimateItem } from "@/lib/fuel/meals";
import { FUEL_DISCLAIMER } from "@/lib/fuel/plan";

type Item = EstimateItem & { scale: number };
type Stage = { kind: "capture" } | { kind: "estimating" } | { kind: "confirm"; items: Item[]; label: string; note: string; source: "photo" | "text" | "barcode" };
type Bridge = { webkit?: { messageHandlers?: { diastole?: { postMessage: (m: unknown) => void } } } };
const bridge = () => (typeof window === "undefined" ? undefined : (window as unknown as Bridge).webkit?.messageHandlers?.diastole);

/** Shrinks a photo to at most 1024 px on its long side, as JPEG (base64, no prefix). Works with iPhone HEIC in Safari. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That photo couldn't be opened."));
      i.src = url;
    });
    const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "Log a meal": photo and/or words -> Claude's estimate -> one confirm card -> saved. The photo never leaves this sheet except for the estimate. */
export default function MealLogger({ numbers = true, autoOpen = false, compact = false, start, timeZone }: { numbers?: boolean; autoOpen?: boolean; compact?: boolean; start?: "photo" | "scan" | "describe"; timeZone: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "capture" });
  const [photo, setPhoto] = useState<{ preview: string; base64: string } | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);
  const [inApp, setInApp] = useState(false);
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState("");
  const [eaten, setEaten] = useState<EatenAt>({ ago: 0 }); // when it was eaten (meals logged afterwards)

  // Drop the photo from memory when the sheet closes (after confirming, or cancelling).
  const reset = () => {
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto(null);
    setText("");
    setError(null);
    setStage({ kind: "capture" });
    setEaten({ ago: 0 });
  };
  const close = () => {
    reset();
    setOpen(false);
  };
  // ?log=1 opens the sheet (from Today). Deferred: the portal needs the browser's document.
  useEffect(() => {
    if (!autoOpen) return;
    const t = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(t);
  }, [autoOpen]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The iPhone app scans with the camera; a browser can type the number.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setInApp(document.documentElement.dataset.app === "ios" && Boolean(bridge())), 0);
    const onCode = (e: Event) => {
      const d = (e as CustomEvent<{ code?: string; error?: string }>).detail;
      if (d?.code) void lookup(d.code);
      else if (d?.error === "unavailable") setError("This iPhone can't scan barcodes. Type the number instead.");
    };
    window.addEventListener("diastole:barcode", onCode);
    return () => {
      clearTimeout(t);
      window.removeEventListener("diastole:barcode", onCode);
    };
  });

  async function lookup(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 8) return setError("That doesn't look like a barcode.");
    setError(null);
    setStage({ kind: "estimating" });
    try {
      const r = await (await fetch(`/api/fuel/barcode?code=${digits}`)).json().catch(() => ({ ok: false, error: "Sign in again, then retry." }));
      if (!r.ok) {
        setError(r.error ?? "Couldn't find that product.");
        return setStage({ kind: "capture" });
      }
      setTyping(false);
      setCode("");
      setStage({ kind: "confirm", items: [{ ...(r.item as EstimateItem), scale: 1 }], label: r.label ?? "", note: "", source: "barcode" });
    } catch {
      setError("No connection. Try again.");
      setStage({ kind: "capture" });
    }
  }

  // Opened from the iPhone widget straight into a step (?via=photo|scan|describe), once.
  useEffect(() => {
    if (!open || !start || started.current) return;
    if (start === "scan" && !inApp && document.documentElement.dataset.app === "ios") return; // wait for the app bridge
    started.current = true;
    const t = setTimeout(() => {
      if (start === "describe") noteRef.current?.focus();
      else if (start === "photo") fileRef.current?.click();
      else scan();
    }, 150);
    return () => clearTimeout(t);
  });

  function scan() {
    setError(null);
    if (inApp) bridge()?.postMessage({ type: "scanBarcode" });
    else setTyping(true);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const base64 = await shrink(file);
      if (photo) URL.revokeObjectURL(photo.preview);
      setPhoto({ preview: URL.createObjectURL(file), base64 });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function estimate() {
    if (!photo && !text.trim()) return setError("Add a photo or describe the meal.");
    setError(null);
    setStage({ kind: "estimating" });
    try {
      const res = await fetch("/api/fuel/estimate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: photo?.base64 ?? null, text }) });
      const r = await res.json().catch(() => ({ ok: false, error: "Sign in again, then retry." }));
      if (!r.ok) {
        setError(r.error ?? "Couldn't estimate that.");
        return setStage({ kind: "capture" });
      }
      setStage({ kind: "confirm", items: (r.items as EstimateItem[]).map((i) => ({ ...i, scale: 1 })), label: r.label ?? "", note: text.trim(), source: photo ? "photo" : "text" });
    } catch {
      setError("No connection. Try again.");
      setStage({ kind: "capture" });
    }
  }

  function confirm() {
    if (stage.kind !== "confirm") return;
    startSaving(async () => {
      const r = await saveMeal({ label: stage.label, items: stage.items, source: stage.source, note: stage.note, eaten });
      if (!r.ok) return setError(r.error);
      close();
      router.refresh();
    });
  }

  const update = (fn: (s: Extract<Stage, { kind: "confirm" }>) => Partial<Extract<Stage, { kind: "confirm" }>>) =>
    setStage((s) => (s.kind === "confirm" ? { ...s, ...fn(s) } : s));

  const sum = stage.kind === "confirm" ? totals(stage.items.map((i) => confirmItem(i, i.scale))) : null;

  const sheet = open ? (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Log a meal">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={close} aria-hidden />
      <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-white/10 bg-panel p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] text-white shadow-2xl sm:rounded-[28px]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{stage.kind === "confirm" ? "Look right?" : "Log a meal"}</h2>
          <button onClick={close} className="flex h-11 w-11 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.08]" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {stage.kind !== "confirm" && (
          <div className="mt-4 space-y-4">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            {photo ? (
              <div className="relative overflow-hidden rounded-2xl border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview of an unsaved photo */}
                <img src={photo.preview} alt="Your meal" className="max-h-72 w-full object-cover" />
                <button onClick={() => fileRef.current?.click()} className="absolute bottom-2 right-2 min-h-10 rounded-full bg-black/60 px-4 text-sm backdrop-blur">
                  Change
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/[0.04] text-white/75 transition active:scale-[0.98]"
              >
                <Camera size={26} className="text-emerald-200" aria-hidden />
                <span className="text-sm">Take or choose a photo</span>
              </button>
            )}
            {!photo &&
              (typing ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void lookup(code);
                  }}
                  className="flex gap-2"
                >
                  <input
                    inputMode="numeric"
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 14))}
                    placeholder="Barcode number"
                    aria-label="Barcode number"
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[16px] tabular-nums focus:border-emerald-300/40 focus:outline-none"
                  />
                  <button disabled={code.length < 8 || stage.kind === "estimating"} className="min-h-12 rounded-2xl border border-white/15 px-4 text-sm disabled:opacity-50">
                    Look up
                  </button>
                </form>
              ) : (
                <button onClick={scan} disabled={stage.kind === "estimating"} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] text-sm text-white/80">
                  <ScanBarcode size={18} className="text-emerald-200" aria-hidden /> {inApp ? "Scan a barcode" : "Enter a barcode"}
                </button>
              ))}
            <label className="block">
              <span className="text-sm text-white/60">Anything to add? (optional)</span>
              <textarea
                ref={noteRef}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 500))}
                rows={2}
                placeholder={photo ? "e.g. oat milk, I ate half the rice" : "e.g. 2 eggs, toast with butter, a banana"}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[16px] placeholder:text-white/30 focus:border-emerald-300/40 focus:outline-none"
              />
            </label>
            {error && <p className="text-sm text-amber-100/90">{error}</p>}
            <button
              onClick={estimate}
              disabled={stage.kind === "estimating"}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 font-medium text-emerald-950 transition active:scale-[0.98] disabled:opacity-60"
            >
              {stage.kind === "estimating" ? (
                <>
                  <Loader2 size={18} className="animate-spin" aria-hidden /> Looking at your meal…
                </>
              ) : (
                "Estimate"
              )}
            </button>
            <p className="text-xs text-white/40">Your photo is only used for this estimate and isn&rsquo;t saved.</p>
          </div>
        )}

        {stage.kind === "confirm" && (
          <div className="mt-4 space-y-4">
            <input
              value={stage.label}
              onChange={(e) => update(() => ({ label: e.target.value.slice(0, 60) }))}
              placeholder="Name this meal"
              aria-label="Meal name"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[16px] font-medium focus:border-emerald-300/40 focus:outline-none"
            />
            <ul className="space-y-2">
              {stage.items.map((it, i) => (
                <li key={i} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-medium">{it.name}</p>
                      <p className="text-xs text-white/50">{[it.portion, it.scale !== 1 ? scaleLabel(it.scale).toLowerCase() : null].filter(Boolean).join(" · ")}</p>
                    </div>
                    <button
                      onClick={() => update((s) => ({ items: s.items.filter((_, j) => j !== i) }))}
                      className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/45 hover:bg-white/[0.08]"
                      aria-label={`Remove ${it.name}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    {numbers ? (
                      <p className="text-xs tabular-nums text-white/65">
                        <span className="text-emerald-200">C</span> {rangeText(it.carbs, it.scale)} · <span className="text-sky-200">P</span> {rangeText(it.protein, it.scale)} ·{" "}
                        <span className="text-amber-200">F</span> {rangeText(it.fat, it.scale)}
                      </p>
                    ) : (
                      <span />
                    )}
                    <div className="flex items-center gap-1" role="group" aria-label={`Portion of ${it.name}`}>
                      <button
                        onClick={() => update((s) => ({ items: s.items.map((x, j) => (j === i ? { ...x, scale: stepScale(x.scale, -1) } : x)) }))}
                        disabled={it.scale <= 0.5}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 disabled:opacity-30"
                        aria-label="Smaller"
                      >
                        <Minus size={15} />
                      </button>
                      <button
                        onClick={() => update((s) => ({ items: s.items.map((x, j) => (j === i ? { ...x, scale: stepScale(x.scale, 1) } : x)) }))}
                        disabled={it.scale >= 2}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 disabled:opacity-30"
                        aria-label="Bigger"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {sum && numbers && (
              <p className="rounded-2xl bg-white/[0.05] px-4 py-3 text-sm tabular-nums text-white/80">
                About <span className="text-emerald-200">{Math.round(sum.carbs_g)} g carbs</span> · <span className="text-sky-200">{Math.round(sum.protein_g)} g protein</span> ·{" "}
                <span className="text-amber-200">{Math.round(sum.fat_g)} g fat</span> · {sum.kcal} kcal
              </p>
            )}
            <div>
              <p className="mb-2 text-sm text-white/60">When did you eat it?</p>
              <EatenPicker timeZone={timeZone} value={eaten} onChange={setEaten} />
            </div>
            {error && <p className="text-sm text-amber-100/90">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStage({ kind: "capture" })} className="min-h-12 rounded-2xl border border-white/15 px-5 text-sm text-white/75">
                Back
              </button>
              <button
                onClick={confirm}
                disabled={saving || !stage.items.length}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-300 font-medium text-emerald-950 transition active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
                Log it
              </button>
            </div>
            <p className="text-xs leading-relaxed text-white/40">Estimates are rough ranges; the middle of each is saved. {FUEL_DISCLAIMER}</p>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center justify-center gap-2 rounded-2xl bg-emerald-300 font-medium text-emerald-950 transition active:scale-[0.97] ${compact ? "min-h-11 px-4 text-sm" : "min-h-12 px-5"}`}
      >
        <Camera size={compact ? 16 : 18} aria-hidden /> Log a meal
      </button>
      {sheet && createPortal(sheet, document.body)}
    </>
  );
}

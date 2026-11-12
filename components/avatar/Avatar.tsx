"use client";

import { useEffect, useRef, useState } from "react";

import { normalizeLook } from "@/lib/avatar/look";
import { gearOf } from "@/lib/grit/catalog";
import type { Mood, SceneOpts, Stage } from "@/lib/avatar/mannequin";
import type { Pain, Spot } from "@/lib/avatar/pain";
import type { Region, Strain } from "@/lib/avatar/strain";

export type Hit = { region: Region | null; spot: Spot | null };

export type { Mood };

export type AvatarState = {
  mood?: Mood; // today's readiness: fresh (green), ok (yellow), tired (red)
  strain?: Strain; // muscles worked (a workout) or still recovering (the last 72 h)
  aura?: number; // fitness progression 0..4, from real milestones
  badges?: string[]; // milestone pins (shown under the full avatar)
};

type Props = AvatarState & {
  look: unknown;
  variant?: "full" | "bust"; // full = live 3D you can spin; bust = still image for small spots
  blocks?: boolean; // the Blocks theme's boxy version
  view?: "front" | "back"; // still images; and which way a live one faces
  pain?: Pain; // sore spots (check-in)
  mode?: "strain" | "pain"; // which layer shows and gets tapped
  onPick?: (hit: Hit) => void; // live only: tap the body
  still?: boolean; // a picture instead of a live figure (lists of workouts)
  className?: string;
  title?: string;
};

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The live, drag-to-spin 3D mannequin. three.js loads only when one of these is on screen. */
function Live({ opts, className, title, onPick }: { opts: SceneOpts; className: string; title?: string; onPick?: (hit: Hit) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  // Rebuilds on body/mood/aura changes; muscle taps only repaint (below).
  const { strain, pain, mode, view, ...shape } = opts;
  const key = JSON.stringify(shape);
  const paintKey = JSON.stringify({ strain: strain ?? {}, pain: pain ?? {}, mode: mode ?? "strain" });
  const optsRef = useRef(opts);
  const pickRef = useRef(onPick);
  // Keep the latest props for the event handlers (runs before the mount effect below).
  useEffect(() => {
    optsRef.current = opts;
    pickRef.current = onPick;
  });
  const facing = useRef<{ target: number | null }>({ target: null });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = canvas.current!;
    let alive = true;
    let raf = 0;
    let visible = true;
    let spin = 0.35;
    let base = 0.35;
    let vel = 0;
    let dragging = false;
    let lastX = 0;
    let idleFrom = 0;
    let downAt = { x: 0, y: 0, t: 0 };
    const still = reduced() || Boolean(pickRef.current); // no sway while editing: taps need a steady target

    const draw = (t: number) => stage.current?.render(t, spin);
    const loop = (t: number) => {
      if (!alive) return;
      if (!dragging) {
        // Turning to face front/back (the editor's buttons).
        if (facing.current.target !== null) {
          const d = facing.current.target - base;
          base += d * 0.18;
          if (Math.abs(d) < 0.002) facing.current.target = null;
          idleFrom = t;
        }
        if (Math.abs(vel) > 0.0004) {
          base += vel;
          vel *= 0.94;
          idleFrom = t;
        }
        // A slow, gentle sway when nobody's touching it.
        spin = base + (still ? 0 : Math.sin((t - idleFrom) / 2600) * 0.22);
      }
      draw(t);
      if (visible && (!still || dragging || Math.abs(vel) > 0.0004 || facing.current.target !== null)) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };

    const size = () => {
      const r = el.getBoundingClientRect();
      stage.current?.resize(Math.max(1, r.width), Math.max(1, r.height));
      draw(performance.now());
    };
    const ro = new ResizeObserver(size);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) kick();
    });

    void import("@/lib/avatar/mannequin").then((m) => {
      if (!alive) return;
      stage.current = m.createStage(el, optsRef.current);
      setReady(true);
      ro.observe(el);
      io.observe(el);
      size();
      kick();
    });

    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      vel = 0;
      el.setPointerCapture(e.pointerId);
      kick();
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = (e.clientX - lastX) / 120;
      lastX = e.clientX;
      base += dx;
      spin = base;
      vel = dx * 0.6;
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      idleFrom = performance.now();
      // A tap (not a drag) on the figure picks the muscle under it.
      if (pickRef.current && e.type === "pointerup" && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8 && performance.now() - downAt.t < 450) {
        const r = el.getBoundingClientRect();
        const hit = stage.current?.pick(e.clientX - r.left, e.clientY - r.top);
        if (hit) {
          vel = 0;
          pickRef.current(hit);
        }
      }
      kick();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      stage.current?.dispose();
      stage.current = null;
    };
  }, []);

  // Slider changes and readiness updates rebuild the figure in place.
  const built = useRef(key);
  useEffect(() => {
    if (!stage.current || built.current === key) return;
    built.current = key;
    stage.current.update(optsRef.current);
    stage.current.render(performance.now(), 0.35);
  }, [key]);
  // Muscle and pain edits just repaint.
  useEffect(() => {
    if (!stage.current) return;
    stage.current.setPaint(JSON.parse(paintKey) as { strain: Strain; pain: Pain; mode: "strain" | "pain" });
    stage.current.render(performance.now(), 0.35);
  }, [paintKey]);
  // Face front or back when asked.
  useEffect(() => {
    if (!view) return;
    facing.current.target = view === "back" ? Math.PI : 0;
    canvas.current?.dispatchEvent(new PointerEvent("pointercancel"));
  }, [view]);

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={`${title ?? "Avatar"}. Drag to turn it.`}
      className={`touch-pan-y cursor-grab select-none transition-opacity duration-500 active:cursor-grabbing ${ready ? "opacity-100" : "opacity-0"} ${className}`}
    />
  );
}

/** A still picture of the same 3D figure, for lists, the feed and chat. */
function Still({ opts, className, title }: { opts: SceneOpts; className: string; title?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const key = JSON.stringify(opts);
  useEffect(() => {
    let alive = true;
    void import("@/lib/avatar/mannequin").then((m) => m.snapshot(JSON.parse(key) as SceneOpts)).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [key]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- generated in the browser
    <img src={src} alt={title ?? ""} className={`object-contain ${className}`} draggable={false} />
  ) : (
    <span className={`block animate-pulse rounded-full bg-emerald-300/10 ${className}`} aria-hidden />
  );
}

export default function Avatar({ look, mood = null, strain, pain, mode, aura = 0, badges = [], variant = "full", view, blocks = false, onPick, still = false, className = "", title }: Props) {
  const gear = gearOf(look);
  const opts: SceneOpts = { look: normalizeLook(look), mood, strain, pain, mode, aura, variant, blocks, view, ...(Object.keys(gear).length ? { gear } : {}) };
  if (variant === "bust" || still) return <Still opts={opts} className={className} title={title} />;
  return (
    <span className="relative inline-flex flex-col items-center">
      <Live opts={opts} className={className} title={title} onPick={onPick} />
      {badges.length > 0 && (
        <span className="pointer-events-none -mt-2 flex gap-1" aria-label={`Milestones: ${badges.join(" ")}`}>
          {badges.slice(0, 4).map((b, i) => (
            <span key={i} className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-200/30 bg-black/40 text-sm backdrop-blur">
              {b}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

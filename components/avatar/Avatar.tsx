"use client";

import { useEffect, useRef, useState } from "react";

import { normalizeLook } from "@/lib/avatar/look";
import type { LoadAreas, Mood, SceneOpts, Stage } from "@/lib/avatar/mannequin";

export type { LoadAreas, Mood };

export type AvatarState = {
  mood?: Mood; // today's readiness: fresh (green), ok (yellow), tired (red)
  load?: LoadAreas; // where the last few days' training landed, 0..1
  aura?: number; // fitness progression 0..4, from real milestones
  badges?: string[]; // milestone pins (shown under the full avatar)
};

type Props = AvatarState & {
  look: unknown;
  variant?: "full" | "bust"; // full = live 3D you can spin; bust = still image for small spots
  blocks?: boolean; // the Blocks theme's boxy version
  className?: string;
  title?: string;
};

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The live, drag-to-spin 3D mannequin. three.js loads only when one of these is on screen. */
function Live({ opts, className, title }: { opts: SceneOpts; className: string; title?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const key = JSON.stringify(opts);
  const optsRef = useRef(key);
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
    const still = reduced();

    const draw = (t: number) => stage.current?.render(t, spin);
    const loop = (t: number) => {
      if (!alive) return;
      if (!dragging) {
        if (Math.abs(vel) > 0.0004) {
          base += vel;
          vel *= 0.94;
          idleFrom = t;
        }
        // A slow, gentle sway when nobody's touching it.
        spin = base + (still ? 0 : Math.sin((t - idleFrom) / 2600) * 0.22);
      }
      draw(t);
      if (visible && (!still || dragging || Math.abs(vel) > 0.0004)) raf = requestAnimationFrame(loop);
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
      stage.current = m.createStage(el, JSON.parse(optsRef.current) as SceneOpts);
      setReady(true);
      ro.observe(el);
      io.observe(el);
      size();
      kick();
    });

    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
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
    const up = () => {
      dragging = false;
      idleFrom = performance.now();
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
  useEffect(() => {
    optsRef.current = key;
    if (stage.current) {
      stage.current.update(JSON.parse(key) as SceneOpts);
      stage.current.render(performance.now(), 0.35);
    }
  }, [key]);

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

export default function Avatar({ look, mood = null, load, aura = 0, badges = [], variant = "full", blocks = false, className = "", title }: Props) {
  const opts: SceneOpts = { look: normalizeLook(look), mood, load, aura, variant, blocks };
  if (variant === "bust") return <Still opts={opts} className={className} title={title} />;
  return (
    <span className="relative inline-flex flex-col items-center">
      <Live opts={opts} className={className} title={title} />
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

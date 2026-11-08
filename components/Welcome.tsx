"use client";

import { Bell, ChevronLeft, Dumbbell, HeartPulse, MessageCircle, Orbit, Sun, Utensils, Watch, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { markWelcomed } from "@/lib/activity/actions";

type Card = { icon: LucideIcon; kicker: string; title: string; body: ReactNode; extra?: ReactNode };

/** First-run tour on Today: why the name, then a quick walk through the app. Shown once; replayable from Me. */
export default function Welcome({ firstName, hasWatch, replay }: { firstName?: string; hasWatch: boolean; replay: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [inApp, setInApp] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  // Deferred: the portal needs the browser's document.
  useEffect(() => {
    const t = setTimeout(() => {
      setInApp(document.documentElement.dataset.app === "ios");
      setOpen(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const cards: Card[] = [
    {
      icon: HeartPulse,
      kicker: firstName ? `Welcome, ${firstName}` : "Welcome",
      title: "Welcome to Diastole",
      body: (
        <>
          Diastole is the moment between heartbeats when your heart relaxes and refills. It&apos;s when the work actually pays off. Training breaks you down; recovery is
          where you get stronger. We built Diastole around that balance of work and rest.
        </>
      ),
    },
    {
      icon: Watch,
      kicker: "Step 1",
      title: "Connect your watch",
      body: "Garmin or Apple Watch. Your workouts, sleep and recovery sync on their own, so your coach sees how you're really doing.",
      extra: hasWatch ? (
        <p className="text-sm text-emerald-200">Your watch is connected ✓</p>
      ) : (
        <Link href="/connect" onClick={() => void finish(false)} className="inline-flex min-h-11 items-center rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 text-sm font-medium text-emerald-50 active:scale-95">
          Connect now →
        </Link>
      ),
    },
    {
      icon: Sun,
      kicker: "Step 2",
      title: "Today",
      body: "Your home screen: today's readiness (green, yellow or red), what's planned next, and your progress through the week.",
    },
    {
      icon: Dumbbell,
      kicker: "Step 3",
      title: "Training",
      body: "Workouts from your coach land here and go straight to your watch. After each one, tell your coach how it felt. It takes five seconds and it shapes what comes next.",
    },
    {
      icon: Utensils,
      kicker: "Step 4",
      title: "Fuel",
      body: "Snap a photo of a meal, check the estimate, and log it. The photo is deleted right away. Your rings fill toward targets that rise and fall with your training.",
    },
    {
      icon: MessageCircle,
      kicker: "Step 5",
      title: "Messages",
      body: "Talk to your coach directly: questions, photos, voice notes. When your coach messages you or sends a workout, you'll hear a duck quack. 🦆",
    },
    {
      icon: Orbit,
      kicker: "Step 6",
      title: "Pods",
      body: "Train alongside teammates. Send props, see each other's wins, and choose exactly what you share in Me → Pods.",
    },
    {
      icon: Bell,
      kicker: "Last thing",
      title: "Stay in the loop",
      body: inApp
        ? "Allow notifications when your phone asks, so you hear from your coach right away. Pick the sounds you like in Me → Notifications."
        : "Get the Diastole iPhone app to hear from your coach right away. Your coach can send you the invite.",
      extra: <p className="text-sm text-white/50 md:hidden">Tap the Diastole logo at the top any time to get around{inApp ? ", or swipe in from the left edge" : ""}.</p>,
    },
  ];
  const last = i === cards.length - 1;
  const card = cards[i];

  async function finish(go = true) {
    setOpen(false);
    await markWelcomed().catch(() => {});
    if (go && replay) router.replace("/me");
  }
  const next = () => (last ? void finish() : setI(i + 1));
  const back = () => setI(Math.max(0, i - 1));

  if (!open) return null;
  const Icon = card.icon;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Diastole"
      className="fixed inset-0 z-[90] flex flex-col bg-canvas/95 text-white backdrop-blur-2xl"
      onTouchStart={(e) => {
        e.stopPropagation(); // keep the app's edge-swipe menu out of the tour
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (dx < 0) next();
        else back();
      }}
    >
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button onClick={back} disabled={i === 0} aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-full text-white/60 disabled:opacity-0">
          <ChevronLeft size={22} />
        </button>
        {!last && (
          <button onClick={() => void finish()} className="min-h-11 px-3 text-sm text-white/55 hover:text-white">
            Skip
          </button>
        )}
      </div>

      <div key={i} className="page-breathe-in mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6">
        <span className="flex h-20 w-20 items-center justify-center rounded-[28px] border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
          <Icon size={38} aria-hidden />
        </span>
        <p className="mt-8 text-xs uppercase tracking-[0.3em] text-emerald-200/60">{card.kicker}</p>
        <h2 className="mt-3 text-3xl font-medium tracking-tight">{card.title}</h2>
        <p className="mt-4 text-base leading-relaxed text-white/70">{card.body}</p>
        {card.extra && <div className="mt-6">{card.extra}</div>}
      </div>

      <div className="mx-auto w-full max-w-md px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <div className="mb-5 flex justify-center gap-2" aria-hidden>
          {cards.map((_, n) => (
            <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-emerald-300" : "w-1.5 bg-white/25"}`} />
          ))}
        </div>
        <button onClick={next} className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-300 font-medium text-black active:scale-[0.98]">
          {last ? "Let's go" : i === 0 ? "Show me around" : "Next"}
        </button>
        {last && (
          <Link href="/help" onClick={() => void finish(false)} className="mt-2 flex min-h-11 w-full items-center justify-center text-sm text-white/60 hover:text-white">
            Or watch a short video tour
          </Link>
        )}
      </div>
    </div>,
    document.body,
  );
}

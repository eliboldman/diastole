"use client";

import { ArrowUp, Bike, CalendarDays, Camera, Dumbbell, Footprints, Mic, Pause, Play, RotateCcw, Square, Trash2, Waves, X, Activity as ActivityIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useToast } from "@/components/coach/Toast";
import { sportLabel } from "@/lib/activity/format";
import { baseMime, extFor, recorderMime, shrinkPhoto } from "@/lib/messages/media";
import { BODY_MAX, MESSAGE_COLUMNS, PAGE, VOICE_MAX_S, type ConversationInfo, type Message, type WorkoutRef } from "@/lib/messages/types";
import { sportGroup } from "@/lib/pod-stickers";
import { browserClient } from "@/lib/supabase/browser";

const BUCKET = "message-media";
const now = () => Date.now(); // only from handlers and effects

type Local = Message & { status?: "sending" | "failed"; localUrl?: string; retry?: () => void };

// ---------------------------------------------------------------- small pieces

const SPORT_ICON = { swim: Waves, run: Footprints, bike: Bike, strength: Dumbbell, other: ActivityIcon } as const;

function WorkoutChip({ w, mine, onRemove }: { w: WorkoutRef; mine?: boolean; onRemove?: () => void }) {
  const Icon = w.kind === "planned" ? CalendarDays : SPORT_ICON[sportGroup(w.sport)];
  const href = w.kind === "activity" ? `/activity/${w.id}` : null;
  const inner = (
    <>
      <Icon size={15} className="shrink-0 text-emerald-200" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{w.title}</span>
        <span className="block truncate text-xs text-white/50">{`${w.kind === "planned" ? "Planned · " : ""}${w.date}`}</span>
      </span>
    </>
  );
  const cls = `flex min-w-0 max-w-full items-center gap-2 rounded-2xl border px-3 py-2 ${mine ? "border-emerald-200/20 bg-black/15" : "border-white/10 bg-white/[0.05]"}`;
  return (
    <span className="flex items-center gap-1">
      {href ? (
        <Link href={href} className={`${cls} hover:border-emerald-200/40`}>
          {inner}
        </Link>
      ) : (
        <span className={cls}>{inner}</span>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Remove workout" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/[0.06]">
          <X size={16} />
        </button>
      )}
    </span>
  );
}

const urlCache = new Map<string, Promise<string | null>>();
function useSignedUrl(path: string | null, local?: string) {
  const [url, setUrl] = useState<string | null>(local ?? null);
  useEffect(() => {
    if (local || !path) return;
    let live = true;
    if (!urlCache.has(path)) {
      urlCache.set(
        path,
        browserClient()
          .storage.from(BUCKET)
          .createSignedUrl(path, 60 * 60 * 6)
          .then(({ data }) => data?.signedUrl ?? null),
      );
    }
    void urlCache.get(path)!.then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [path, local]);
  return url;
}

function Photo({ m }: { m: Local }) {
  const url = useSignedUrl(m.media_path, m.localUrl);
  const [big, setBig] = useState(false);
  const ratio = m.media_meta.w && m.media_meta.h ? m.media_meta.w / m.media_meta.h : 4 / 3;
  return (
    <>
      <button
        type="button"
        onClick={() => url && setBig(true)}
        className="block w-64 max-w-full overflow-hidden rounded-2xl bg-white/[0.06]"
        style={{ aspectRatio: String(Math.min(Math.max(ratio, 0.6), 1.8)) }}
        aria-label="Open photo"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, private URL */}
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      </button>
      {big &&
        url &&
        createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" onClick={() => setBig(false)} role="dialog" aria-label="Photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="max-h-full max-w-full rounded-2xl" />
          <button type="button" aria-label="Close" className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
            <X size={20} />
          </button>
        </div>,
          document.body,
        )}
    </>
  );
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Voice({ m, mine }: { m: Local; mine: boolean }) {
  const url = useSignedUrl(m.media_path, m.localUrl);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [failed, setFailed] = useState(false);
  const total = m.media_meta.seconds ?? 0;
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setFailed(true));
    else a.pause();
  };
  // A few bars that look like a waveform; deterministic per message so it doesn't jump around.
  const bars = useMemo(() => Array.from({ length: 24 }, (_, i) => 0.3 + (((m.id.charCodeAt(i % m.id.length) * (i + 7)) % 70) / 100)), [m.id]);
  const progress = total ? Math.min(1, at / total) : 0;
  return (
    <span className="flex w-60 max-w-full items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${mine ? "bg-black/20" : "bg-emerald-300/20"} text-white disabled:opacity-50`}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="translate-x-px" />}
      </button>
      <span className="flex h-8 flex-1 items-center gap-[3px]" aria-hidden>
        {bars.map((h, i) => (
          <span key={i} className={`w-[3px] rounded-full ${i / bars.length < progress ? "bg-white" : "bg-white/35"}`} style={{ height: `${h * 100}%` }} />
        ))}
      </span>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-white/70">{failed ? "!" : mmss(playing || at ? at : total)}</span>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setAt(0);
          }}
          onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const key = (x: Date) => x.toDateString();
  if (key(d) === key(new Date())) return "Today";
  if (key(d) === key(new Date(Date.now() - 86_400_000))) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// ---------------------------------------------------------------- the thread

export default function Thread({
  conv,
  me,
  initial,
  initialRefs,
  attach: attachInitial,
  hasMore: hasMoreInitial,
}: {
  conv: ConversationInfo;
  me: string;
  initial: Message[]; // oldest first
  initialRefs: Record<string, WorkoutRef>;
  attach: WorkoutRef | null;
  hasMore: boolean;
}) {
  const supabase = browserClient();
  const { show, element: toast } = useToast(5000);
  const [msgs, setMsgs] = useState<Local[]>(initial);
  const [refs, setRefs] = useState(initialRefs);
  const [reads, setReads] = useState(conv.reads);
  const [hasMore, setHasMore] = useState(hasMoreInitial);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  const people = useMemo(() => Object.fromEntries(conv.people.map((p) => [p.id, p])), [conv.people]);
  const group = conv.kind === "pod";
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  const scrollDown = useCallback((smooth = true) => {
    requestAnimationFrame(() => bottom.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" }));
  }, []);

  // Track whether the reader is at the bottom, so incoming messages only auto-scroll then.
  useEffect(() => {
    const onScroll = () => {
      nearBottom.current = window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 240;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    scrollDown(false);
    return () => window.removeEventListener("scroll", onScroll);
  }, [scrollDown]);

  // ---- read receipts
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => void supabase.rpc("mark_conversation_read", { p_conv: conv.id }), 600);
  }, [supabase, conv.id]);
  useEffect(() => {
    markRead();
    const onVisible = () => markRead();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  // ---- linked workouts that arrive later
  const resolveRefs = useCallback(
    async (list: Message[]) => {
      const acts = list.filter((m) => m.activity_id && !refs[m.activity_id]).map((m) => m.activity_id!);
      const plans = list.filter((m) => m.planned_workout_id && !refs[m.planned_workout_id]).map((m) => m.planned_workout_id!);
      const add: Record<string, WorkoutRef> = {};
      if (acts.length) {
        const { data } = await supabase.from("activities").select("id, name, sport, start_time").in("id", acts);
        for (const a of data ?? [])
          add[a.id] = { kind: "activity", id: a.id, title: a.name || sportLabel(a.sport), sport: a.sport, date: new Date(a.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
      }
      if (plans.length) {
        const { data } = await supabase.from("planned_workouts").select("id, title, sport, scheduled_date").in("id", plans);
        for (const w of data ?? [])
          add[w.id] = { kind: "planned", id: w.id, title: w.title, sport: w.sport, date: new Date(`${w.scheduled_date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
      }
      if (Object.keys(add).length) setRefs((r) => ({ ...r, ...add }));
    },
    [supabase, refs],
  );

  // ---- realtime: new and deleted messages, read times, typing
  useEffect(() => {
    const ch = supabase
      .channel(`conversation:${conv.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` }, (p) => {
        const m = p.new as Message;
        setMsgs((list) => (list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? { ...m, localUrl: x.localUrl } : x)) : [...list, m]));
        setTyping((t) => {
          const n = { ...t };
          delete n[m.sender_id];
          return n;
        });
        void resolveRefs([m]);
        if (m.sender_id !== me) {
          markRead();
          if (nearBottom.current) scrollDown();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` }, (p) => {
        const m = p.new as Message;
        setMsgs((list) => list.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_reads", filter: `conversation_id=eq.${conv.id}` }, (p) => {
        const r = p.new as { user_id?: string; last_read_at?: string };
        if (r.user_id && r.last_read_at) setReads((x) => ({ ...x, [r.user_id!]: r.last_read_at! }));
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const who = (payload as { user?: string }).user;
        if (who && who !== me) setTyping((t) => ({ ...t, [who]: now() }));
      })
      .subscribe((status) => {
        // After a reconnect, catch up on anything missed while offline.
        if (status === "SUBSCRIBED") void catchUp();
      });
    channelRef.current = ch;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one subscription per conversation
  }, [conv.id]);

  const latestRef = useRef<string | null>(initial.at(-1)?.created_at ?? null);
  useEffect(() => {
    latestRef.current = msgs.filter((m) => !m.status).at(-1)?.created_at ?? latestRef.current;
  }, [msgs]);
  async function catchUp() {
    if (!latestRef.current) return;
    const { data } = await supabase.from("messages").select(MESSAGE_COLUMNS).eq("conversation_id", conv.id).gt("created_at", latestRef.current).order("created_at").limit(100);
    if (!data?.length) return;
    setMsgs((list) => {
      const have = new Set(list.map((m) => m.id));
      return [...list, ...(data as Message[]).filter((m) => !have.has(m.id))].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
    void resolveRefs(data as Message[]);
    markRead();
  }

  // Typing names fade after 4 s.
  const typingNames = Object.entries(typing)
    .filter(([, t]) => tick - t < 4000)
    .map(([id]) => people[id]?.name.split(" ")[0] ?? "Someone");
  useEffect(() => {
    if (!Object.keys(typing).length) return;
    const i = setInterval(() => {
      const t = now();
      setTick(t);
      // Drop stale entries so this timer stops once nobody is typing.
      setTyping((x) => {
        const live = Object.entries(x).filter(([, at]) => t - at < 4000);
        return live.length === Object.keys(x).length ? x : Object.fromEntries(live);
      });
    }, 1000);
    return () => clearInterval(i);
  }, [typing]);
  useEffect(() => {
    if (typingNames.length && nearBottom.current) scrollDown();
  }, [typingNames.length, scrollDown]);

  const lastTyped = useRef(0);
  const sendTyping = () => {
    const t = now();
    if (t - lastTyped.current < 2500) return;
    lastTyped.current = t;
    void channelRef.current?.send({ type: "broadcast", event: "typing", payload: { user: me } });
  };

  // ---- older messages
  const [loadingOlder, setLoadingOlder] = useState(false);
  async function loadOlder() {
    const oldest = msgs.find((m) => !m.status)?.created_at;
    if (!oldest) return;
    setLoadingOlder(true);
    const before = document.documentElement.scrollHeight;
    const { data } = await supabase.from("messages").select(MESSAGE_COLUMNS).eq("conversation_id", conv.id).lt("created_at", oldest).order("created_at", { ascending: false }).limit(PAGE);
    setLoadingOlder(false);
    const older = ((data ?? []) as Message[]).reverse();
    if (older.length < PAGE) setHasMore(false);
    setMsgs((list) => [...older, ...list]);
    void resolveRefs(older);
    // Keep the reader's place.
    requestAnimationFrame(() => window.scrollBy(0, document.documentElement.scrollHeight - before));
  }

  // ---- sending
  const [attach, setAttach] = useState<WorkoutRef | null>(attachInitial);
  const insert = useCallback(
    async (m: Local) => {
      const { error } = await supabase.from("messages").insert({
        id: m.id,
        conversation_id: conv.id,
        sender_id: me,
        body: m.body,
        media_kind: m.media_kind,
        media_path: m.media_path,
        media_meta: m.media_meta,
        activity_id: m.activity_id,
        planned_workout_id: m.planned_workout_id,
      });
      return error;
    },
    [supabase, conv.id, me],
  );

  const place = (m: Local) => {
    setMsgs((list) => [...list, m]);
    nearBottom.current = true;
    scrollDown();
  };
  const patch = (id: string, p: Partial<Local>) => setMsgs((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function deliver(m: Local, upload?: { blob: Blob; type: string }) {
    patch(m.id, { status: "sending" });
    if (upload) {
      // New file per message; on a retry, "already exists" means the first upload made it.
      const { error } = await supabase.storage.from(BUCKET).upload(m.media_path!, upload.blob, { contentType: upload.type, upsert: false });
      if (error && !/exists|duplicate/i.test(error.message)) {
        patch(m.id, { status: "failed", retry: () => void deliver(m, upload) });
        return show("Couldn't upload that. Tap the message to retry.", { ok: false });
      }
    }
    const error = await insert(m);
    if (error && !/duplicate key/i.test(error.message)) {
      patch(m.id, { status: "failed", retry: () => void deliver(m, upload) });
      return show(/slow down/i.test(error.message) ? "Slow down a little." : "Didn't send. Tap the message to retry.", { ok: false });
    }
    patch(m.id, { status: undefined, retry: undefined });
  }

  const draft = (p: Partial<Local>): Local => ({
    id: crypto.randomUUID(),
    conversation_id: conv.id,
    sender_id: me,
    body: null,
    media_kind: null,
    media_path: null,
    media_meta: {},
    activity_id: attach?.kind === "activity" ? attach.id : null,
    planned_workout_id: attach?.kind === "planned" ? attach.id : null,
    deleted_at: null,
    created_at: new Date().toISOString(),
    status: "sending",
    ...p,
  });
  const takeAttach = () => {
    if (attach) setRefs((r) => ({ ...r, [attach.id]: attach }));
    setAttach(null);
  };

  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const sendText = () => {
    const body = text.trim();
    if (!body) return;
    const m = draft({ body: body.slice(0, BODY_MAX) });
    takeAttach();
    setText("");
    box.current?.focus();
    place(m);
    void deliver(m);
  };

  const photoInput = useRef<HTMLInputElement>(null);
  async function sendPhoto(file: File) {
    try {
      const { blob, w, h } = await shrinkPhoto(file);
      const id = crypto.randomUUID();
      const m = draft({ id, media_kind: "photo", media_path: `${conv.id}/${id}.jpg`, media_meta: { w, h }, localUrl: URL.createObjectURL(blob) });
      takeAttach();
      place(m);
      void deliver(m, { blob, type: "image/jpeg" });
    } catch {
      show("Couldn't read that photo. Try a JPEG or PNG.", { ok: false });
    }
  }

  // ---- voice notes
  const [rec, setRec] = useState<{ started: number; secs: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const discard = useRef(false);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStart = useRef(0);

  async function startRecording() {
    const mime = recorderMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) return show("This browser can't record voice notes.", { ok: false });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return show("Microphone access is off. Allow it in your browser settings to send voice notes.", { ok: false });
    }
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    chunks.current = [];
    discard.current = false;
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (recTimer.current) clearInterval(recTimer.current);
      const started = recStart.current;
      setRec(null);
      if (discard.current) return;
      const seconds = Math.min(VOICE_MAX_S, Math.round((now() - started) / 100) / 10);
      if (seconds < 0.8) return show("Hold on a bit longer to record.", { ok: false });
      const type = baseMime(r.mimeType || mime || "audio/webm");
      const blob = new Blob(chunks.current, { type });
      const id = crypto.randomUUID();
      const m = draft({ id, media_kind: "voice", media_path: `${conv.id}/${id}.${extFor(type)}`, media_meta: { seconds, mime: type }, localUrl: URL.createObjectURL(blob) });
      takeAttach();
      place(m);
      void deliver(m, { blob, type });
    };
    recorder.current = r;
    recStart.current = now();
    r.start(250);
    setRec({ started: recStart.current, secs: 0 });
    navigator.vibrate?.(10);
    recTimer.current = setInterval(() => {
      const secs = (now() - recStart.current) / 1000;
      setRec((x) => (x ? { ...x, secs } : x));
      if (secs >= VOICE_MAX_S && r.state === "recording") r.stop();
    }, 200);
  }
  const stopRecording = (keep: boolean) => {
    discard.current = !keep;
    if (recorder.current?.state === "recording") recorder.current.stop();
  };
  useEffect(
    () => () => {
      discard.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      if (recTimer.current) clearInterval(recTimer.current);
    },
    [],
  );

  // ---- deleting
  const [menu, setMenu] = useState<string | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const t = setTimeout(() => document.addEventListener("pointerdown", close, { once: true }), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", close);
    };
  }, [menu]);
  async function remove(m: Local) {
    setMenu(null);
    patch(m.id, { deleted_at: new Date().toISOString() });
    const { data, error } = await supabase.rpc("delete_message", { p_id: m.id });
    if (error) {
      patch(m.id, { deleted_at: null });
      return show("Couldn't delete that. Try again.", { ok: false });
    }
    if (typeof data === "string" && data) void supabase.storage.from(BUCKET).remove([data]);
  }
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- seen
  const others = conv.people.filter((p) => !p.is_me);
  const myLast = [...msgs].reverse().find((m) => m.sender_id === me && !m.status && !m.deleted_at);
  const seenBy = myLast ? others.filter((p) => reads[p.id] && reads[p.id] >= myLast.created_at) : [];

  // ---- render
  const rows: ReactNode[] = [];
  let prev: Local | null = null;
  for (const m of msgs) {
    const day = dayLabel(m.created_at);
    if (!prev || dayLabel(prev.created_at) !== day) {
      rows.push(
        <li key={`d-${m.id}`} className="py-3 text-center text-[11px] uppercase tracking-[0.2em] text-white/40">
          {day}
        </li>,
      );
    }
    const mine = m.sender_id === me;
    const first = !prev || prev.sender_id !== m.sender_id || Date.parse(m.created_at) - Date.parse(prev.created_at) > 5 * 60_000 || dayLabel(prev.created_at) !== day;
    const ref = m.activity_id ? refs[m.activity_id] : m.planned_workout_id ? refs[m.planned_workout_id] : null;
    const who = people[m.sender_id];
    rows.push(
      <li key={m.id} className={`row-in flex flex-col ${mine ? "items-end" : "items-start"} ${first ? "mt-3" : "mt-1"}`}>
        {first && group && !mine && <span className="mb-1 ml-3 text-xs text-white/50">{who?.name.split(" ")[0] ?? "Someone"}{who?.role === "coach" ? " · coach" : ""}</span>}
        {m.deleted_at ? (
          <span className="rounded-3xl border border-dashed border-white/15 px-4 py-2 text-sm italic text-white/40">Message deleted</span>
        ) : (
          <div className="relative flex max-w-[85%] flex-col gap-1.5 sm:max-w-[70%]">
            {ref && <WorkoutChip w={ref} mine={mine} />}
            <div
              role={mine ? "button" : undefined}
              tabIndex={mine ? 0 : undefined}
              aria-label={mine ? "Message options" : undefined}
              onClick={() => (m.status === "failed" ? m.retry?.() : undefined)}
              onContextMenu={(e) => {
                if (!mine || m.status) return;
                e.preventDefault();
                setMenu(m.id);
              }}
              onPointerDown={() => {
                if (!mine || m.status) return;
                press.current = setTimeout(() => {
                  navigator.vibrate?.(8);
                  setMenu(m.id);
                }, 450);
              }}
              onPointerUp={() => press.current && clearTimeout(press.current)}
              onPointerLeave={() => press.current && clearTimeout(press.current)}
              onKeyDown={(e) => mine && (e.key === "Delete" || e.key === "Backspace") && !m.status && setMenu(m.id)}
              className={`select-text break-words ${m.media_kind === "photo" ? "p-1" : "px-4 py-2.5"} ${
                mine
                  ? "rounded-3xl rounded-br-lg bg-emerald-300/[0.22] text-emerald-50 ring-1 ring-emerald-200/20"
                  : "rounded-3xl rounded-bl-lg border border-white/10 bg-white/[0.07] text-white backdrop-blur-xl"
              } ${m.status === "sending" ? "opacity-70" : ""} ${m.status === "failed" ? "cursor-pointer ring-red-300/50" : ""}`}
              style={{ WebkitTouchCallout: "none" }}
            >
              {m.media_kind === "photo" && <Photo m={m} />}
              {m.media_kind === "voice" && <Voice m={m} mine={mine} />}
              {m.body && <p className={`whitespace-pre-wrap text-[15px] leading-snug ${m.media_kind ? "px-3 pb-1.5 pt-2" : ""}`}>{m.body}</p>}
            </div>
            {menu === m.id && (
              <div className="toast-in absolute -top-12 right-0 z-20 rounded-2xl border border-white/10 bg-panel/95 p-1 shadow-2xl backdrop-blur-xl" onPointerDown={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => void remove(m)} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm text-red-200 hover:bg-white/[0.06]">
                  <Trash2 size={15} /> Delete for everyone
                </button>
              </div>
            )}
          </div>
        )}
        {m.status === "failed" ? (
          <span className="mt-1 flex items-center gap-1 text-xs text-red-200">
            <RotateCcw size={12} /> Not sent · tap to retry
          </span>
        ) : (
          (first || m === myLast) && (
            <span className="mx-3 mt-1 text-[11px] text-white/35">
              {m.status === "sending" ? "Sending…" : timeOf(m.created_at)}
              {m === myLast && seenBy.length > 0 && (
                <span className="text-emerald-200/70">{` · Seen${group ? ` by ${seenBy.map((p) => p.name.split(" ")[0]).join(", ")}` : ""}`}</span>
              )}
            </span>
          )
        )}
      </li>,
    );
    prev = m;
  }

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col">
      {hasMore && (
        <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="mx-auto mb-2 min-h-10 rounded-full px-4 text-sm text-white/50 hover:text-white disabled:opacity-50">
          {loadingOlder ? "Loading…" : "Load earlier messages"}
        </button>
      )}

      {msgs.length === 0 ? (
        <div className="m-auto max-w-sm py-16 text-center">
          <p className="text-4xl" aria-hidden>
            👋
          </p>
          <p className="mt-3 font-medium">Say hi</p>
          <p className="mt-1 text-sm text-white/55">
            {group ? "Everyone in the pod and the coach sees this thread." : "Only the two of you see this. Photos and voice notes work too."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-1 flex-col justify-end pb-2" aria-live="polite">
          {rows}
        </ul>
      )}

      {typingNames.length > 0 && (
        <p className="row-in mb-2 ml-3 flex items-center gap-2 text-xs text-white/50">
          <span className="flex gap-1" aria-hidden>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" />
          </span>
          {`${typingNames.join(", ")} ${typingNames.length > 1 ? "are" : "is"} typing`}
        </p>
      )}
      <div ref={bottom} />

      {/* Composer: sticks above the mobile tab bar */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-20 mt-2 md:bottom-6">
        {attach && (
          <div className="mb-2">
            <WorkoutChip w={attach} onRemove={() => setAttach(null)} />
          </div>
        )}
        {rec ? (
          <div className="flex items-center gap-3 rounded-[28px] border border-red-300/30 bg-panel/90 p-2 pl-4 shadow-2xl backdrop-blur-2xl">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-400" aria-hidden />
            <span className="flex-1 text-sm tabular-nums" aria-live="polite">
              {`Recording ${mmss(rec.secs)} / ${mmss(VOICE_MAX_S)}`}
            </span>
            <button type="button" onClick={() => stopRecording(false)} aria-label="Cancel recording" className="flex h-11 w-11 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.06]">
              <X size={18} />
            </button>
            <button type="button" onClick={() => stopRecording(true)} aria-label="Send voice note" className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-300 text-black">
              <Square size={14} fill="currentColor" />
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendText();
            }}
            className="flex items-end gap-1.5 rounded-[28px] border border-white/10 bg-panel/85 p-1.5 shadow-2xl backdrop-blur-2xl focus-within:border-emerald-300/30"
          >
            <button type="button" onClick={() => photoInput.current?.click()} aria-label="Send a photo" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.06] hover:text-white">
              <Camera size={19} />
            </button>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void sendPhoto(f);
              }}
            />
            <textarea
              ref={box}
              value={text}
              rows={1}
              maxLength={BODY_MAX}
              placeholder={group ? "Message the pod" : `Message ${conv.title.split(" ")[0]}`}
              aria-label="Message"
              onChange={(e) => {
                setText(e.target.value);
                if (e.target.value) sendTyping();
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                // Enter sends on a keyboard; on phones the return key adds a line (send with the button).
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(hover: hover)").matches) {
                  e.preventDefault();
                  sendText();
                }
              }}
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base text-white placeholder:text-white/35 focus:outline-none sm:text-[15px]"
            />
            {text.trim() ? (
              <button type="submit" aria-label="Send" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-300 text-black transition active:scale-90">
                <ArrowUp size={19} />
              </button>
            ) : (
              <button type="button" onClick={() => void startRecording()} aria-label="Record a voice note" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.06] hover:text-white">
                <Mic size={19} />
              </button>
            )}
          </form>
        )}
      </div>
      {toast}
    </div>
  );
}

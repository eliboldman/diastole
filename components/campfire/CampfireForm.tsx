"use client";

import { Camera, Mic, Square, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { saveLog } from "@/lib/campfire/actions";
import { haptic } from "@/lib/haptics";
import { baseMime, extFor, recorderMime, shrinkPhoto } from "@/lib/messages/media";
import { browserClient } from "@/lib/supabase/browser";

type Slot = "h" | "s";
type Media = { path: string; kind: "voice" | "photo"; preview: string } | null;
const MAX_S = 60;
// Only called from event handlers and timers.
const clock = () => Date.now();
const area = "w-full rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-white placeholder:text-white/40 focus:border-amber-200/40 focus:outline-none";

/** Your log at the campfire: a highlight and a struggle, each as words, a voice note or a photo. Coaches drop in a voice note. */
export default function CampfireForm({ podId, meId, coach, initial }: { podId: string; meId: string; coach: boolean; initial?: { highlight: string | null; struggle: string | null } }) {
  const router = useRouter();
  const [highlight, setHighlight] = useState(initial?.highlight ?? "");
  const [struggle, setStruggle] = useState(initial?.struggle ?? "");
  const [media, setMedia] = useState<Record<Slot, Media>>({ h: null, s: null });
  const [rec, setRec] = useState<{ slot: Slot; secs: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function upload(slot: Slot, blob: Blob, type: string, kind: "voice" | "photo") {
    setBusy(slot);
    const path = `${podId}/${meId}/${crypto.randomUUID()}.${kind === "photo" ? "jpg" : extFor(type)}`;
    const { error } = await browserClient().storage.from("campfire").upload(path, blob, { contentType: type, upsert: false });
    setBusy(null);
    if (error) return setMsg({ ok: false, text: "Couldn't upload that. Try again." });
    setMedia((m) => ({ ...m, [slot]: { path, kind, preview: URL.createObjectURL(blob) } }));
  }

  async function record(slot: Slot) {
    if (recorder.current?.state === "recording") return recorder.current.stop();
    const mime = recorderMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) return setMsg({ ok: false, text: "This browser can't record voice notes." });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setMsg({ ok: false, text: "Microphone access is off. Allow it to record a voice note." });
    }
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    const parts: Blob[] = [];
    const t0 = clock();
    r.ondataavailable = (e) => e.data.size && parts.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
      recorder.current = null;
      setRec(null);
      if (clock() - t0 < 800) return;
      const type = baseMime(r.mimeType || mime || "audio/mp4");
      void upload(slot, new Blob(parts, { type }), type, "voice");
    };
    recorder.current = r;
    r.start();
    haptic("light");
    setRec({ slot, secs: 0 });
    timer.current = setInterval(() => {
      const secs = (clock() - t0) / 1000;
      setRec((x) => (x ? { ...x, secs } : x));
      if (secs >= MAX_S && r.state === "recording") r.stop();
    }, 250);
  }

  async function photo(slot: Slot, file: File | undefined) {
    if (!file) return;
    try {
      const { blob } = await shrinkPhoto(file);
      await upload(slot, blob, "image/jpeg", "photo");
    } catch {
      setMsg({ ok: false, text: "Couldn't read that photo." });
    }
  }

  const submit = () =>
    start(async () => {
      const m = (x: Media) => (x ? { path: x.path, kind: x.kind } : null);
      const r = await saveLog(podId, { highlight, struggle, h: m(media.h), s: m(media.s) });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      haptic("success");
      setMsg({ ok: true, text: "Log on the fire. 🔥" });
      router.refresh();
    });

  const attach = (slot: Slot, photos = true) => (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => record(slot)} disabled={busy === slot || (rec !== null && rec.slot !== slot)} className={`flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-xs transition active:scale-95 ${rec?.slot === slot ? "border-rose-300/40 bg-rose-300/10 text-rose-100" : "border-white/10 text-white/70 hover:bg-white/[0.06]"}`}>
        {rec?.slot === slot ? <Square size={13} aria-hidden /> : <Mic size={13} aria-hidden />}
        {rec?.slot === slot ? `Stop · ${Math.floor(rec.secs)}s` : "Voice note"}
      </button>
      {photos && (
        <label className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs text-white/70 hover:bg-white/[0.06]">
          <Camera size={13} aria-hidden /> Photo
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => photo(slot, e.target.files?.[0])} />
        </label>
      )}
      {busy === slot && <span className="text-xs text-white/50">Uploading…</span>}
      {media[slot] && (
        <span className="flex items-center gap-2">
          {media[slot]!.kind === "voice" ? <audio src={media[slot]!.preview} controls className="h-9 max-w-[12rem]" /> : (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview
            <img src={media[slot]!.preview} alt="" className="h-10 w-10 rounded-lg object-cover" />
          )}
          <button type="button" onClick={() => setMedia((m) => ({ ...m, [slot]: null }))} aria-label="Remove" className="flex h-9 w-9 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.06]">
            <X size={14} />
          </button>
        </span>
      )}
    </div>
  );

  return (
    <div className="mt-4 rounded-[22px] border border-amber-200/15 bg-black/20 p-4">
      {coach ? (
        <>
          <p className="text-sm font-medium">Drop in with a voice note</p>
          <p className="text-xs text-white/50">A few words for the pod: what you saw this week, what&apos;s next.</p>
          {attach("h", false)}
        </>
      ) : (
        <>
          <label className="block">
            <span className="text-sm font-medium">One highlight from your week</span>
            <textarea value={highlight} onChange={(e) => setHighlight(e.target.value)} maxLength={280} rows={2} placeholder="A session that clicked, a fun moment, anything" className={`${area} mt-1.5`} />
          </label>
          {attach("h")}
          <label className="mt-3 block">
            <span className="text-sm font-medium">One struggle</span>
            <textarea value={struggle} onChange={(e) => setStruggle(e.target.value)} maxLength={280} rows={2} placeholder="Something that was tough: training, school, life. As light or deep as you like." className={`${area} mt-1.5`} />
          </label>
          {attach("s")}
        </>
      )}
      <button type="button" disabled={pending || busy !== null || rec !== null} onClick={submit} className="mt-4 min-h-11 rounded-2xl bg-amber-200 px-5 text-sm font-medium text-black transition active:scale-95 disabled:opacity-50">
        {initial ? "Update my log" : "Add my log to the fire"}
      </button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-amber-50" : "text-red-200"}`}>{msg.text}</p>}
      <p className="mt-2 text-xs text-white/45">Only your pod sees this. It closes Monday morning; highlights may appear in the pod&apos;s weekly recap.</p>
    </div>
  );
}

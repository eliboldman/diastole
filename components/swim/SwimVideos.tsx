"use client";

import { Trash2, Upload, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { browserClient } from "@/lib/supabase/browser";
import { deleteSwimVideo, replySwimVideo, saveSwimVideo, type SwimVideo } from "@/lib/swim/video";

const MAX = 50 * 1024 * 1024;
const EXT: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function Clip({ v, coach }: { v: SwimVideo; coach: boolean }) {
  const router = useRouter();
  const [reply, setReply] = useState(v.coachNote ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center gap-2 text-xs text-white/50">
        <span className="flex-1">Sent {day(v.createdAt)}</span>
        <button
          type="button"
          disabled={pending}
          aria-label="Delete clip"
          onClick={() =>
            start(async () => {
              await deleteSwimVideo(v.id);
              router.refresh();
            })
          }
          className="flex h-11 w-11 items-center justify-center rounded-xl text-white/40 hover:text-red-300 disabled:opacity-40"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {v.url ? (
        <video src={v.url} controls playsInline preload="metadata" className="mt-1 aspect-video w-full rounded-xl bg-black" />
      ) : (
        <p className="text-sm text-white/50">This clip couldn&apos;t be loaded.</p>
      )}
      {v.athleteNote && <p className="mt-2 text-sm text-white/70">“{v.athleteNote}”</p>}
      {coach ? (
        <form
          className="mt-2 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await replySwimVideo(v.id, reply);
              setMsg(r.ok ? "Sent." : "Couldn't send.");
              router.refresh();
            });
          }}
        >
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} rows={2} placeholder="What you see, and one thing to work on." aria-label="Reply to this clip" className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[16px] text-white placeholder:text-white/30 focus:border-emerald-300/40 focus:outline-none" />
          <div className="flex items-center gap-3">
            <button disabled={pending || !reply.trim() || reply === (v.coachNote ?? "")} className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-medium text-black disabled:opacity-40">
              {v.coachNote ? "Update reply" : "Send reply"}
            </button>
            {msg && <span className="text-xs text-white/55">{msg}</span>}
          </div>
        </form>
      ) : v.coachNote ? (
        <div className="mt-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.05] p-3">
          <p className="text-xs text-emerald-200/80">Your coach</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-emerald-50/90">{v.coachNote}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-white/45">Waiting for your coach to watch.</p>
      )}
    </li>
  );
}

function Uploader({ athleteId }: { athleteId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pick = (f: File | undefined) => {
    setMsg(null);
    if (!f) return setFile(null);
    if (!EXT[f.type]) return setMsg("That isn't a video this can take. Use one from your camera roll.");
    if (f.size > MAX) return setMsg(`That clip is ${Math.round(f.size / 1048576)} MB; the limit is 50. Trim it to 15–20 seconds in Photos first.`);
    setFile(f);
  };
  const send = async () => {
    if (!file) return;
    setBusy(true);
    setMsg("Uploading…");
    const path = `${athleteId}/${crypto.randomUUID()}.${EXT[file.type]}`;
    const { error } = await browserClient().storage.from("swim-video").upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      setBusy(false);
      return setMsg("Upload failed. Check your connection and try again.");
    }
    const r = await saveSwimVideo(path, note);
    setBusy(false);
    if (!r.ok) return setMsg(r.error ?? "Couldn't save that clip.");
    setFile(null);
    setNote("");
    if (input.current) input.current.value = "";
    setMsg("Sent to your coach.");
    router.refresh();
  };
  return (
    <div className="mt-3 grid gap-2">
      <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" id="swim-video-file" onChange={(e) => pick(e.target.files?.[0])} />
      <label htmlFor="swim-video-file" className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm text-white/85 hover:bg-white/[0.1]">
        <Video size={16} className="text-emerald-200" aria-hidden /> {file ? "Choose a different clip" : "Choose a clip"}
      </label>
      {file && (
        <>
          <p className="text-xs text-white/55">
            {file.name} · {Math.max(1, Math.round(file.size / 1048576))} MB
          </p>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Anything to look for? (optional)" aria-label="Note for your coach" className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[16px] text-white placeholder:text-white/30 focus:border-emerald-300/40 focus:outline-none" />
          <button type="button" disabled={busy} onClick={send} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-emerald-300 px-4 text-sm font-medium text-black disabled:opacity-40">
            <Upload size={15} aria-hidden /> {busy ? "Sending…" : "Send to coach"}
          </button>
        </>
      )}
      {msg && <p className="text-xs text-white/60" role="status">{msg}</p>}
    </div>
  );
}

/** Stroke videos: the athlete films and sends; the coach watches and replies. Two newest clips kept. */
export default function SwimVideos({ athleteId, videos, coach = false, asked = false }: { athleteId: string; videos: SwimVideo[]; coach?: boolean; asked?: boolean }) {
  if (coach && !videos.length) return null;
  return (
    <div className="mt-5">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Video size={16} className="text-emerald-200" aria-hidden /> {coach ? "Stroke videos" : asked ? "Your coach would like a stroke video" : "Stroke video"}
      </h3>
      {!coach && (
        <>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/65">
            <li>Side view from the deck, phone at hip height, one easy length of freestyle.</li>
            <li>Or from the end of the lane, swimming toward the camera.</li>
            <li>Landscape, no zoom, 15–20 seconds is plenty.</li>
          </ul>
          <Uploader athleteId={athleteId} />
        </>
      )}
      {videos.length > 0 && (
        <ul className="mt-3 grid gap-3">
          {videos.map((v) => (
            <Clip key={v.id} v={v} coach={coach} />
          ))}
        </ul>
      )}
      {!coach && <p className="mt-2 text-xs text-white/40">Only you and your coach can see these. Your two newest clips are kept.</p>}
    </div>
  );
}

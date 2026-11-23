"use client";

import { Camera, Check, ChevronDown, ImageUp, Loader2, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";

import { canEncodeClip, encodeClip } from "@/lib/recovery/encode-clip";
import { finishClipUpload, startClipUpload } from "@/lib/recovery/film-actions";
import { SHOT_GROUPS, type Shot } from "@/lib/recovery/shots";
import { browserClient } from "@/lib/supabase/browser";

type Done = { poster: string | null };
type Status = { kind: "idle" } | { kind: "preparing"; pct: number } | { kind: "uploading" } | { kind: "saved" } | { kind: "error"; msg: string };

const noop = () => () => {};

/** Film each demo clip with the phone camera (or pick one from Photos) and upload it in place. */
export default function FilmList({ shots, done }: { shots: Shot[]; done: Record<string, Done> }) {
  const canEncode = useSyncExternalStore(noop, canEncodeClip, () => true);
  const total = shots.length;
  const filmed = shots.filter((s) => done[s.slug]).length;

  return (
    <>
      <div className="mt-5 rounded-[28px] border border-white/10 bg-white/[0.055] p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-lg font-medium">{`${filmed} of ${total} filmed`}</p>
          <p className="text-sm text-white/50">{total - filmed ? `${total - filmed} to go` : "All done"}</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-emerald-300" style={{ width: `${(filmed / Math.max(1, total)) * 100}%` }} />
        </div>
        <ul className="mt-4 space-y-1 text-sm text-white/60">
          <li>Phone sideways, whole body in frame, plain background.</li>
          <li>10–20 seconds of the move; the app trims it and makes it loop smoothly.</li>
          <li>One-side moves: film the left side only. The app mirrors it for the right.</li>
          <li>Keep this screen open while a clip prepares (about as long as the clip).</li>
        </ul>
        {!canEncode && <p className="mt-3 text-sm text-amber-200">This browser can&apos;t prepare video. Film from the Diastole iPhone app or Safari.</p>}
      </div>

      {SHOT_GROUPS.map((g) => {
        const list = shots.filter((s) => s.group === g);
        const left = list.filter((s) => !done[s.slug]);
        const got = list.filter((s) => done[s.slug]);
        return (
          <section key={g} className="mt-8">
            <h2 className="mb-2 flex items-baseline justify-between text-sm uppercase tracking-[0.15em] text-white/50">
              {g}
              <span className="text-xs normal-case tracking-normal">{left.length ? `${left.length} to film` : "All filmed"}</span>
            </h2>
            <ul className="space-y-2">
              {left.map((s) => (
                <ShotRow key={s.slug} shot={s} done={null} disabled={!canEncode} />
              ))}
            </ul>
            {got.length > 0 && (
              <details className="group mt-2">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm text-white/55">
                  <ChevronDown size={16} className="transition group-open:rotate-180" aria-hidden /> {`${got.length} filmed`}
                </summary>
                <ul className="mt-1 space-y-2">
                  {got.map((s) => (
                    <ShotRow key={s.slug} shot={s} done={done[s.slug]} disabled={!canEncode} />
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}
    </>
  );
}

function ShotRow({ shot, done, disabled }: { shot: Shot; done: Done | null; disabled: boolean }) {
  const router = useRouter();
  const id = useId();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "preparing" || status.kind === "uploading";

  const take = async (file: File | undefined) => {
    if (!file) return;
    try {
      setStatus({ kind: "preparing", pct: 0 });
      const clip = await encodeClip(file, (f) => setStatus({ kind: "preparing", pct: Math.round(f * 100) }));
      setStatus({ kind: "uploading" });
      const slot = await startClipUpload(shot.slug);
      if (!slot.ok) throw new Error(slot.error);
      const bucket = browserClient().storage.from("recovery");
      const [v, p] = await Promise.all([
        bucket.uploadToSignedUrl(slot.video.path, slot.video.token, clip.video, { contentType: "video/mp4" }),
        bucket.uploadToSignedUrl(slot.poster.path, slot.poster.token, clip.poster, { contentType: "image/jpeg" }),
      ]);
      if (v.error || p.error) throw new Error("Upload failed. Check your connection and try again.");
      const r = await finishClipUpload(shot.slug, slot.video.path, slot.poster.path, clip.seconds);
      if (!r.ok) throw new Error(r.error ?? "Couldn't save that clip.");
      setStatus({ kind: "saved" });
      router.refresh();
    } catch (e) {
      setStatus({ kind: "error", msg: e instanceof Error ? e.message : "Something went wrong. Try again." });
    }
  };

  const button = "inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 text-sm font-medium transition active:scale-95";
  return (
    <li className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex gap-3">
        {done?.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={done.poster} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
        ) : done ? (
          <Check size={18} className="mt-0.5 shrink-0 text-emerald-300" aria-label="filmed" />
        ) : (
          <Video size={18} className="mt-0.5 shrink-0 text-white/40" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {shot.name}
            {shot.oneSide && <span className="ml-2 text-xs font-normal text-white/45">left side only</span>}
          </p>
          {!done && shot.note && <p className="mt-1 text-sm text-white/55">{shot.note}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* capture opens the camera straight to video on the phone; on a computer it's a file picker. */}
        <input id={`${id}-cam`} type="file" accept="video/*" capture="environment" className="sr-only" disabled={busy || disabled} onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }} />
        <label htmlFor={`${id}-cam`} aria-disabled={busy || disabled} className={`${button} bg-emerald-300 text-black ${busy || disabled ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
          <Camera size={16} aria-hidden /> {done ? "Re-film" : "Film it"}
        </label>
        <input id={`${id}-lib`} type="file" accept="video/*" className="sr-only" disabled={busy || disabled} onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }} />
        <label htmlFor={`${id}-lib`} aria-disabled={busy || disabled} className={`${button} border border-white/15 text-white/80 ${busy || disabled ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-white/[0.06]"}`}>
          <ImageUp size={16} aria-hidden /> From Photos
        </label>
        <p role="status" className="text-sm">
          {status.kind === "preparing" && <span className="inline-flex items-center gap-1.5 text-white/60"><Loader2 size={14} className="animate-spin" aria-hidden /> Preparing {status.pct}%</span>}
          {status.kind === "uploading" && <span className="inline-flex items-center gap-1.5 text-white/60"><Loader2 size={14} className="animate-spin" aria-hidden /> Uploading…</span>}
          {status.kind === "saved" && <span className="text-emerald-200">Saved. Athletes see it now.</span>}
          {status.kind === "error" && <span className="text-red-300">{status.msg}</span>}
        </p>
      </div>
    </li>
  );
}

"use client";

import { Download, Share } from "lucide-react";
import { useState } from "react";

type Bridge = { webkit?: { messageHandlers?: { diastole?: { postMessage: (m: unknown) => void } } } };

/** Preview plus Share: the iPhone share sheet in the app, the Web Share API in a browser, else a download. */
export default function StoryShare({ src }: { src: string }) {
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setMsg(null);
    try {
      const blob = await (await fetch(src)).blob();
      const native = (window as unknown as Bridge).webkit?.messageHandlers?.diastole;
      if (native && document.documentElement.dataset.app === "ios") {
        const data = await new Promise<string>((ok, bad) => {
          const r = new FileReader();
          r.onload = () => ok(String(r.result).split(",")[1] ?? "");
          r.onerror = bad;
          r.readAsDataURL(blob);
        });
        native.postMessage({ type: "shareImage", data });
        return;
      }
      const file = new File([blob], "diastole-season.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Diastole season" });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "diastole-season.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setMsg("Couldn't share it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 max-w-sm">
      <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]">
        {!loaded && <div className="absolute inset-0 animate-pulse bg-white/[0.04]" aria-hidden />}
        {/* eslint-disable-next-line @next/next/no-img-element -- generated per request, private */}
        <img src={src} alt="Your season story" onLoad={() => setLoaded(true)} className="h-full w-full object-cover" />
      </div>
      <button onClick={share} disabled={busy || !loaded} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 font-medium text-[#0d1513] disabled:opacity-50">
        <Share size={18} aria-hidden /> {busy ? "Getting it ready…" : "Share"}
      </button>
      <a href={src} download="diastole-season.png" className="mt-2 flex min-h-11 items-center justify-center gap-2 text-sm text-white/55 hover:text-white">
        <Download size={16} aria-hidden /> Download
      </a>
      {msg && <p className="mt-2 text-sm text-red-200">{msg}</p>}
    </div>
  );
}

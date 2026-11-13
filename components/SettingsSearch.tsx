"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

// Settings that live on other pages, found by the same search.
const ELSEWHERE: { label: string; href: string; words: string }[] = [
  { label: "My numbers: max HR, threshold pace, FTP, zones", href: "/me/setup#numbers", words: "zones heart rate hr pace ftp power threshold numbers" },
  { label: "Training days and times", href: "/me/setup#week", words: "days week schedule availability time" },
  { label: "Gear and closet", href: "/me/setup#closet", words: "gear shoes bike closet clothes" },
  { label: "Sleep and bedtime", href: "/me/setup#sleep", words: "sleep bedtime wake nudge" },
  { label: "Connections: Garmin, Apple Watch, Zwift", href: "/connect", words: "garmin apple watch connect sync zwift rouvy intervals device reconnect" },
  { label: "Avatar", href: "/profile/edit", words: "avatar look profile picture" },
  { label: "Body weight (for fuel targets)", href: "/fuel#weight", words: "weight body fuel targets" },
  { label: "Pods and sharing", href: "/me/pods", words: "pods sharing privacy share" },
];

/** Filters the settings cards on this page as you type, and lists matching settings found elsewhere. */
export default function SettingsSearch({ container }: { container: string }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  useEffect(() => {
    const root = document.getElementById(container);
    if (!root) return;
    let shown = 0;
    root.querySelectorAll<HTMLElement>("section").forEach((s) => {
      const hit = !term || (s.textContent ?? "").toLowerCase().includes(term) || (s.dataset.words ?? "").includes(term);
      s.style.display = hit ? "" : "none";
      if (hit) shown++;
    });
    root.dataset.empty = term && !shown ? "1" : "";
  }, [term, container]);
  const others = term ? ELSEWHERE.filter((e) => e.label.toLowerCase().includes(term) || e.words.includes(term)) : [];
  return (
    <div className="mt-6 max-w-xl">
      <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 focus-within:border-emerald-300/40">
        <Search size={17} className="text-white/45" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings: sounds, units, tabs, zones…" aria-label="Search settings" className="min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-white/35 focus:outline-none sm:text-sm" />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="flex h-9 w-9 items-center justify-center rounded-full text-white/50 hover:bg-white/[0.06]">
            <X size={15} />
          </button>
        )}
      </label>
      {others.length > 0 && (
        <ul className="mt-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
          {others.map((o) => (
            <li key={o.href}>
              <Link href={o.href} className="flex min-h-11 items-center justify-between rounded-xl px-3 text-sm text-white/80 hover:bg-white/[0.05]">
                {o.label} <span className="text-white/40">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { MapPin, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import type { Place } from "@/lib/weather";
import { findPlaces, saveWeatherLocation } from "@/lib/weather-actions";

/** Where you usually train: a town, for workout and race-day forecasts. */
export default function WeatherLocation({ initial }: { initial: Place | null }) {
  const [place, setPlace] = useState<Place | null>(initial);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState(false);
  const [, start] = useTransition();
  const seq = useRef(0);

  // Search as they type, a beat after they stop.
  useEffect(() => {
    if (q.trim().length < 2) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const r = await findPlaces(q);
      if (n === seq.current) setResults(r);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const save = (p: Place | null) => {
    setPlace(p);
    setQ("");
    setResults([]);
    start(async () => setError(!(await saveWeatherLocation(p)).ok));
  };

  if (place)
    return (
      <div className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <MapPin size={15} className="shrink-0 text-emerald-200" aria-hidden />
          <span className="truncate">{place.name}</span>
        </span>
        <button type="button" onClick={() => save(null)} aria-label="Remove location" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/50 hover:text-white">
          <X size={16} aria-hidden />
        </button>
        {error && <span className="sr-only">Couldn&apos;t save</span>}
      </div>
    );

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (e.target.value.trim().length < 2) setResults([]);
        }}
        placeholder="Your town, e.g. Austin"
        aria-label="Town for weather"
        autoComplete="off"
        className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-base placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none sm:text-sm"
      />
      {results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 rounded-2xl border border-white/10 bg-panel/95 p-1 shadow-2xl backdrop-blur-xl">
          {results.map((p) => (
            <li key={`${p.lat},${p.lon}`}>
              <button type="button" onClick={() => save(p)} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-white/[0.08]">
                <MapPin size={14} className="shrink-0 text-white/40" aria-hidden />
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-red-200">Couldn&apos;t save. Try again.</p>}
    </div>
  );
}

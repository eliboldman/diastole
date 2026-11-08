"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState } from "react";

import { accentHex } from "@/lib/accent";

// Free vector tiles from OpenFreeMap (no key, no cost). Attribution is shown by the map itself.
const STYLE = "https://tiles.openfreemap.org/styles/dark";

/** The route with its first and last stretch already removed on the server. Points are [lat, lon]. */
export default function RouteMap({ route }: { route: [number, number][] }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let map: import("maplibre-gl").Map | null = null;
    let cancelled = false;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || !box.current) return;
        // Same-origin copy made by scripts/copy-maplibre-worker.mjs; the bundler can't locate it.
        maplibre.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
        const coords = route.map(([lat, lon]) => [lon, lat] as [number, number]);
        const bounds = coords.reduce((b, c) => b.extend(c), new maplibre.LngLatBounds(coords[0], coords[0]));
        const m = new maplibre.Map({
          container: box.current,
          style: STYLE,
          bounds,
          fitBoundsOptions: { padding: 32 },
          attributionControl: { compact: true },
          cooperativeGestures: true, // one finger scrolls the page; two fingers move the map
          dragRotate: false,
          pitchWithRotate: false,
        });
        map = m;
        m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        m.on("load", () => {
          m.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } });
          m.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "#15201d", "line-width": 6 }, layout: { "line-cap": "round", "line-join": "round" } });
          m.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": accentHex(), "line-width": 3 }, layout: { "line-cap": "round", "line-join": "round" } });
        });
        m.on("error", (e) => console.warn("Route map", e.error?.message));
      } catch (e) {
        console.warn("Route map could not load", e);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [route]);

  if (failed) return <p className="text-sm text-white/55">The map couldn&apos;t load right now.</p>;
  return (
    <div>
      <div ref={box} className="h-72 w-full overflow-hidden rounded-2xl border border-white/10 sm:h-96" role="img" aria-label="Route map" />
      <p className="mt-2 text-xs text-white/45">The first and last 200 m are hidden so start and finish locations aren&apos;t shown.</p>
    </div>
  );
}

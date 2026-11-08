import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { clock, paceOf, shortDistance, sportLabel } from "@/lib/activity/format";
import { createClient, getProfile } from "@/lib/supabase/server";

// Retro Receipt: a finished workout as a paper receipt, a ticket stub or a pixel slip (1080x1350).
// Only ever your own workouts.

type Style = "receipt" | "ticket" | "pixel";
const STYLES: Record<Style, { bg: string; paper: string; ink: string; faint: string; accent: string; radius: number }> = {
  receipt: { bg: "#1b1d1c", paper: "#f6f3ea", ink: "#1b1b1b", faint: "#7a776e", accent: "#1b1b1b", radius: 6 },
  ticket: { bg: "#0d1513", paper: "#fdf2d8", ink: "#3a2412", faint: "#9a7a55", accent: "#c2410c", radius: 28 },
  pixel: { bg: "#14120e", paper: "#1b3a0c", ink: "#b9eb92", faint: "#6cbf35", accent: "#effbe6", radius: 0 },
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getProfile();
  if (!me) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const style = (["receipt", "ticket", "pixel"].includes(request.nextUrl.searchParams.get("style") ?? "") ? request.nextUrl.searchParams.get("style") : "receipt") as Style;
  const supabase = await createClient();
  const [{ data: a }, { count: prs }] = await Promise.all([
    supabase.from("activities").select("athlete_id, name, sport, start_time, duration_s, distance_m, avg_hr, elevation_gain_m, calories, avg_speed_mps").eq("id", id).maybeSingle(),
    supabase.from("achievements").select("id", { count: "exact", head: true }).eq("activity_id", id).like("key", "pr_%"),
  ]);
  if (!a || a.athlete_id !== me.id) return new Response("Not found", { status: 404 });

  const c = STYLES[style];
  const u = me.units === "km" ? "km" : "mi";
  const when = new Date(a.start_time);
  const date = when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: me.timezone }).toUpperCase();
  const time = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: me.timezone });
  const what = (a.name || sportLabel(a.sport)).slice(0, 26);
  const dist = shortDistance(a.distance_m, u, a.sport);
  const lines: [string, string][] = [
    [`1 × ${what.toUpperCase()}`, dist || clock(a.duration_s) || ""],
    ["TIME", clock(a.duration_s) ?? "—"],
    ...(a.avg_speed_mps && /run|walk|hik/i.test(a.sport ?? "") ? [[`PACE /${u.toUpperCase()}`, paceOf(Number(a.avg_speed_mps), u) ?? "—"] as [string, string]] : []),
    ...(a.avg_hr ? [["AVG HEART RATE", `${Math.round(Number(a.avg_hr))} BPM`] as [string, string]] : []),
    ...(a.elevation_gain_m ? [["CLIMBING", u === "mi" ? `${Math.round(Number(a.elevation_gain_m) * 3.281)} FT` : `${Math.round(Number(a.elevation_gain_m))} M`] as [string, string]] : []),
    ...(a.calories ? [["ENERGY", `${Math.round(Number(a.calories))} KCAL`] as [string, string]] : []),
  ];
  const total = prs ? `${prs} PR${prs === 1 ? "" : "S"}` : "1 WORKOUT";
  const no = String(Math.abs(id.split("").reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)) % 1000000).padStart(6, "0");
  const title = style === "ticket" ? "ADMIT ONE" : style === "pixel" ? "WORKOUT.EXE" : "DIASTOLE";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}>
        <div style={{ width: 760, display: "flex", flexDirection: "column", backgroundColor: c.paper, color: c.ink, borderRadius: c.radius, padding: "64px 64px 56px", boxShadow: "0 30px 80px rgba(0,0,0,0.45)", border: style === "pixel" ? "8px solid #8fd95a" : style === "ticket" ? "4px dashed #c9a46b" : "none" }}>
          <div style={{ display: "flex", justifyContent: "center", fontSize: 54, fontWeight: 800, letterSpacing: style === "pixel" ? 2 : 10, color: c.accent }}>{title}</div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 10, fontSize: 24, letterSpacing: 4, color: c.faint }}>{style === "receipt" ? "BUILT BETWEEN THE BEATS" : style === "ticket" ? "ONE NIGHT ONLY · YOUR LEGS" : "> LOADING GAINS..."}</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 36, fontSize: 24, color: c.faint }}>
            <div style={{ display: "flex" }}>{date}</div>
            <div style={{ display: "flex" }}>{time}</div>
            <div style={{ display: "flex" }}>{`NO. ${no}`}</div>
          </div>
          <div style={{ display: "flex", marginTop: 20, borderTop: `3px dashed ${c.faint}` }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 30 }}>
            {lines.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 32 }}>
                <div style={{ display: "flex" }}>{k}</div>
                <div style={{ display: "flex", fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: 30, borderTop: `3px dashed ${c.faint}` }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 26, fontSize: 40, fontWeight: 800 }}>
            <div style={{ display: "flex" }}>TOTAL</div>
            <div style={{ display: "flex" }}>{total}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 28, color: c.faint }}>
            <div style={{ display: "flex" }}>PAID IN</div>
            <div style={{ display: "flex" }}>SWEAT</div>
          </div>
          {/* A made-up barcode */}
          <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 44, height: 90 }}>
            {Array.from({ length: 46 }, (_, i) => (
              <div key={i} style={{ display: "flex", width: (Number(no[i % 6]) % 3) + 2, height: "100%", backgroundColor: c.ink, opacity: i % 7 === 0 ? 0.4 : 1 }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 26, fontSize: 24, letterSpacing: 3, color: c.faint }}>{style === "pixel" ? "PRESS START TO TRAIN AGAIN" : "THANK YOU, COME AGAIN"}</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { "Cache-Control": "private, no-store" } },
  );
}

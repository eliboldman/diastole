import { ImageResponse } from "next/og";

import { getBoard, getCamp, recapFor } from "@/lib/camp/data";
import { createClient, getProfile } from "@/lib/supabase/server";

// The signed-in athlete's camp recap as a 1080x1350 PNG. Only their own numbers and the team total.

const BG = "#0d1513";
const ACCENT = "#6ee7b7";
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getProfile();
  if (!me) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found.", { status: 404 });
  const supabase = await createClient();
  const camp = await getCamp(supabase, id); // row-level security: pod members and the coach
  if (!camp) return new Response("Not found.", { status: 404 });
  const board = await getBoard(supabase, id);
  const r = recapFor(board, me.id);
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const unit = camp.goal_metric === "distance" ? "km" : camp.goal_metric;
  const first = (me.full_name ?? "").trim().split(/\s+/)[0] || "";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: BG, backgroundImage: "radial-gradient(circle at 30% 10%, rgba(110,231,183,0.24) 0%, rgba(13,21,19,0) 55%)", color: "white", padding: "100px 90px 90px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M5 12h3l2-4 3 8 2-4h4" />
          </svg>
          <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: -1 }}>Diastole</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 110 }}>
          <div style={{ fontSize: 32, letterSpacing: 8, color: ACCENT, textTransform: "uppercase" }}>Training camp</div>
          <div style={{ fontSize: 76, fontWeight: 700, marginTop: 16, letterSpacing: -2, lineHeight: 1.05 }}>{camp.title}</div>
          <div style={{ fontSize: 32, color: "rgba(255,255,255,0.55)", marginTop: 14 }}>
            {fmt(camp.starts_on)} – {fmt(camp.ends_on)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 90 }}>
          <div style={{ fontSize: 30, color: "rgba(255,255,255,0.6)" }}>{first ? `${first} did` : "I did"}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 6 }}>
            <div style={{ fontSize: 180, fontWeight: 700, letterSpacing: -6, lineHeight: 1 }}>{r.done}</div>
            <div style={{ fontSize: 48, color: "rgba(255,255,255,0.55)" }}>of {r.planned} sessions</div>
          </div>
          {r.badge && (
            <div style={{ display: "flex", marginTop: 34 }}>
              <div style={{ display: "flex", fontSize: 38, padding: "14px 34px", borderRadius: 999, border: `3px solid ${ACCENT}`, color: ACCENT }}>{r.badge.label}</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 36, color: "rgba(255,255,255,0.75)" }}>
          Together the team logged {board.total.toLocaleString("en-US")} {unit}
          {board.total >= camp.goal_value ? " and hit the goal." : "."}
        </div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { "Cache-Control": "private, no-store" } },
  );
}

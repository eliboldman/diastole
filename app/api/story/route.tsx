import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { asPeriod, periodRange } from "@/lib/story";
import { loadStory } from "@/lib/story-data";
import { createClient, getProfile } from "@/lib/supabase/server";

// The signed-in athlete's season story as a 1080x1920 PNG (phone story size). Only ever their own.

const BG = "#0d1513";
const ACCENT = "#6ee7b7";
const SPORT_COLOR = { run: "#6ee7b7", bike: "#7dd3fc", swim: "#c4b5fd", other: "#fcd34d" } as const;

export async function GET(request: NextRequest) {
  const me = await getProfile();
  if (!me) return new Response("Sign in first.", { status: 401 });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const period = periodRange(asPeriod(request.nextUrl.searchParams.get("period")), today);
  const s = await loadStory(await createClient(), me.id, period.from, period.to, me.timezone);
  const mi = me.units === "mi";
  const dist = (km: number) => (km < 1 ? null : `${Math.round(mi ? km / 1.609344 : km).toLocaleString("en-US")} ${mi ? "mi" : "km"}`);
  const maxH = Math.max(1, ...s.bySport.map((x) => x.hours));
  const first = (me.full_name ?? "").trim().split(/\s+/)[0] || "";
  const fmt = (d: string, year = false) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: year ? "numeric" : undefined, timeZone: "UTC" });
  const lastDay = new Date(Date.parse(`${period.to}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const range = `${fmt(period.from)} – ${fmt(lastDay > today ? today : lastDay, true)}`;
  const tiles = [
    s.longest ? { k: "Longest session", v: s.longest.minutes >= 60 ? `${Math.floor(s.longest.minutes / 60)}h ${s.longest.minutes % 60}m` : `${s.longest.minutes} min`, sub: s.longest.label } : null,
    s.bestStreakWeeks >= 2 ? { k: "Best streak", v: `${s.bestStreakWeeks} weeks`, sub: "in a row" } : null,
    s.prs ? { k: "Personal records", v: String(s.prs), sub: s.prs === 1 ? "new best" : "new bests" } : null,
    s.races ? { k: "Races", v: String(s.races), sub: "finished" } : null,
    s.readyPct != null ? { k: "Ready days", v: `${s.readyPct}%`, sub: "green readiness" } : null,
  ].filter((t): t is { k: string; v: string; sub: string } => t != null).slice(0, 4);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: BG, backgroundImage: "radial-gradient(circle at 35% 12%, rgba(110,231,183,0.26) 0%, rgba(13,21,19,0) 55%)", color: "white", padding: "110px 90px 90px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M5 12h3l2-4 3 8 2-4h4" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>Diastole</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 120 }}>
          <div style={{ fontSize: 34, letterSpacing: 8, color: ACCENT, textTransform: "uppercase" }}>{period.monthly ? "Monthly recap" : period.label}</div>
          <div style={{ fontSize: 76, fontWeight: 700, marginTop: 18, letterSpacing: -2, lineHeight: 1.05 }}>{first ? `${first}'s ${period.heading}` : `My ${period.heading}`}</div>
          <div style={{ fontSize: 32, color: "rgba(255,255,255,0.55)", marginTop: 14 }}>{range}</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 60, marginTop: 90 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 200, fontWeight: 800, letterSpacing: -8, lineHeight: 1 }}>{String(s.hours)}</div>
            <div style={{ fontSize: 36, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>hours of training</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 8 }}>
            <div style={{ fontSize: 96, fontWeight: 700, lineHeight: 1 }}>{String(s.workouts)}</div>
            <div style={{ fontSize: 36, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>workouts</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 34, marginTop: 90 }}>
          {s.bySport.map((x) => (
            <div key={x.key} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 36 }}>
                <div style={{ display: "flex" }}>{x.label}</div>
                <div style={{ display: "flex", color: "rgba(255,255,255,0.65)" }}>{[`${x.hours} h`, dist(x.km)].filter(Boolean).join(" · ")}</div>
              </div>
              <div style={{ display: "flex", height: 26, borderRadius: 13, background: "rgba(255,255,255,0.08)" }}>
                <div style={{ display: "flex", width: `${Math.max(4, (x.hours / maxH) * 100)}%`, borderRadius: 13, background: SPORT_COLOR[x.key] }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 80 }}>
          {tiles.map((t) => (
            <div key={t.k} style={{ display: "flex", flexDirection: "column", width: 438, padding: "30px 34px", borderRadius: 36, background: "rgba(255,255,255,0.06)", border: "2px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 26, letterSpacing: 4, textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>{t.k}</div>
              <div style={{ fontSize: 64, fontWeight: 700, marginTop: 10 }}>{t.v}</div>
              <div style={{ fontSize: 28, color: "rgba(255,255,255,0.55)" }}>{t.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", fontSize: 30, color: "rgba(255,255,255,0.45)" }}>
          <div style={{ display: "flex" }}>Built between the beats.</div>
          <div style={{ display: "flex" }}>diastole.app</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, headers: { "Cache-Control": "private, no-store" } },
  );
}

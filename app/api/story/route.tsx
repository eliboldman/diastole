import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { asPeriod, buildStory, PERIODS } from "@/lib/story";
import { createClient, getProfile } from "@/lib/supabase/server";

// The signed-in athlete's season story as a 1080x1920 PNG (phone story size). Only ever their own.

const BG = "#0d1513";
const ACCENT = "#6ee7b7";
const SPORT_COLOR = { run: "#6ee7b7", bike: "#7dd3fc", swim: "#c4b5fd", other: "#fcd34d" } as const;

export async function GET(request: NextRequest) {
  const me = await getProfile();
  if (!me) return new Response("Sign in first.", { status: 401 });
  const period = PERIODS.find((p) => p.id === asPeriod(request.nextUrl.searchParams.get("period")))!;
  const since = new Date(Date.now() - period.days * 86_400_000);
  const sinceIso = since.toISOString();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });

  const supabase = await createClient();
  const [{ data: acts }, { count: prs }, { count: races }, { data: ready }] = await Promise.all([
    supabase.from("activities").select("sport, start_time, duration_s, distance_m").eq("athlete_id", me.id).gte("start_time", sinceIso).limit(2000),
    supabase.from("achievements").select("id", { count: "exact", head: true }).eq("athlete_id", me.id).like("key", "pr_%").gte("achieved_at", sinceIso),
    supabase.from("races").select("id", { count: "exact", head: true }).eq("athlete_id", me.id).gte("race_date", sinceIso.slice(0, 10)).lte("race_date", today),
    supabase.from("readiness_scores").select("overall").eq("athlete_id", me.id).gte("date", sinceIso.slice(0, 10)),
  ]);
  const s = buildStory({ activities: acts ?? [], prs: prs ?? 0, races: races ?? 0, readiness: (ready ?? []).map((r) => r.overall as string) });

  const mi = me.units === "mi";
  const dist = (km: number) => (km < 1 ? null : `${Math.round(mi ? km / 1.609344 : km).toLocaleString("en-US")} ${mi ? "mi" : "km"}`);
  const maxH = Math.max(1, ...s.bySport.map((x) => x.hours));
  const first = (me.full_name ?? "").trim().split(/\s+/)[0] || "";
  const range = `${since.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
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
          <div style={{ fontSize: 34, letterSpacing: 8, color: ACCENT, textTransform: "uppercase" }}>{period.label}</div>
          <div style={{ fontSize: 76, fontWeight: 700, marginTop: 18, letterSpacing: -2, lineHeight: 1.05 }}>{first ? `${first}'s season` : "My season"}</div>
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

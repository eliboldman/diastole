import { NextResponse } from "next/server";

import { deviceFromRequest } from "@/lib/devices/auth";
import { FINDER_PACES } from "@/lib/breath/plan";
import { insertBreath, insertHold } from "@/lib/breath/save";
import { watchBreath } from "@/lib/breath/watch";
import { createAdminClient } from "@/lib/supabase/server";

// The Garmin Breathe app (bearer token, the same link as the Diastole watch widget).
// GET: pace + today's suggestion. POST: a finished session or a CO2 hold, possibly sent later
// (the watch keeps unsent ones), with `at` = unix seconds when it finished.
//   session: { k, sec, p, at, hr?: { s, e, sw, rm, sws: { "6.5": 7.2, ... } }, best? (finder, the pace that felt best) }
//   hold:    { hold: seconds, at }

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function GET(request: Request) {
  const device = await deviceFromRequest(request);
  if (!device) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const out = await watchBreath(createAdminClient(), device.profile.id, device.profile.timezone || "America/Los_Angeles");
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const device = await deviceFromRequest(request);
  if (!device) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const tz = device.profile.timezone || "America/Los_Angeles";
  const admin = createAdminClient();
  // When it finished: within the last week, else now.
  const atSec = n(body.at);
  const at = atSec != null && atSec * 1000 <= Date.now() + 60_000 && atSec * 1000 >= Date.now() - 7 * 86_400_000 ? new Date(atSec * 1000) : new Date();

  if (body.hold != null) {
    const res = await insertHold(admin, device.profile.id, tz, Number(body.hold), at);
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }

  const hr = body.hr && typeof body.hr === "object" ? (body.hr as Record<string, unknown>) : null;
  const sws = hr?.sws && typeof hr.sws === "object" ? (hr.sws as Record<string, unknown>) : null;
  const swings = sws ? Object.fromEntries(Object.entries(sws).map(([k, v]) => [String(Number(k)), n(v)]).filter(([, v]) => v != null)) as Record<string, number> : null;
  // Finder ratings: every pace "fine", the one that felt best on top. With HR swings, the swing decides among them.
  const best = n(body.best);
  const ratings = body.k === "finder" ? Object.fromEntries(FINDER_PACES.map((p) => [String(p), p === best ? 5 : 3])) : null;
  const res = await insertBreath(
    admin,
    device.profile.id,
    tz,
    {
      kind: String(body.k ?? ""),
      seconds: Number(body.sec),
      pace: n(body.p),
      calmBefore: null,
      calmAfter: null,
      ratings,
      hr: hr ? { start: n(hr.s), end: n(hr.e), swing: n(hr.sw), rmssd: n(hr.rm), swings, device: "Garmin watch" } : null,
    },
    at,
  );
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}

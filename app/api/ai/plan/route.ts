import { NextResponse, type NextRequest } from "next/server";

import { suggestPlan } from "@/lib/ai/plan";
import { getProfile } from "@/lib/supabase/server";

// A 4-week block can take a couple of minutes to write.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const me = await getProfile();
  if (!me || me.role !== "coach") return NextResponse.json({ ok: false, error: "Coaches only." }, { status: 403 });
  let body: { athleteId?: unknown; start?: unknown; days?: unknown; guidance?: unknown; replaceDrafts?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const athleteId = typeof body.athleteId === "string" && /^[0-9a-f-]{36}$/i.test(body.athleteId) ? body.athleteId : null;
  if (!athleteId) return NextResponse.json({ ok: false, error: "Unknown athlete." }, { status: 400 });
  const result = await suggestPlan(me, {
    athleteId,
    start: typeof body.start === "string" ? body.start : "",
    days: Number(body.days) || 7,
    guidance: typeof body.guidance === "string" ? body.guidance : "",
    replaceDrafts: body.replaceDrafts !== false,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

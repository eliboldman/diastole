import { NextResponse, type NextRequest } from "next/server";

import { estimateMeal } from "@/lib/fuel/estimate";
import { getProfile } from "@/lib/supabase/server";

// Meal photo/description -> estimate. The image arrives already shrunk by the browser (about
// 1024 px JPEG), goes to Claude, and is not saved anywhere.
const MAX_BYTES = 3 * 1024 * 1024;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export async function POST(request: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return NextResponse.json({ ok: false, error: "That photo is too big." }, { status: 413 });

  let body: { image?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const raw = typeof body.image === "string" ? body.image.replace(/^data:image\/jpeg;base64,/, "") : null;
  if (raw && (raw.length > MAX_BYTES || !BASE64.test(raw))) return NextResponse.json({ ok: false, error: "That photo couldn't be read." }, { status: 400 });
  const text = typeof body.text === "string" ? body.text : null;

  const result = await estimateMeal(me, { imageBase64: raw, text });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

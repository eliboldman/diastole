import { NextResponse } from "next/server";

import { linkAppleWatch } from "@/lib/devices/auth";
import { getProfile } from "@/lib/supabase/server";

// The iPhone app (signed in on the web) asks for a token to hand its Apple Watch over
// WatchConnectivity, so the watch signs in without a code. Web sign-in only; answers { token, name }.

export async function POST(request: Request) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { label?: unknown } | null;
  const label = typeof body?.label === "string" ? body.label.replace(/[^\p{L}\p{N} '’()-]/gu, "").trim() : null;
  try {
    const token = await linkAppleWatch(me.id, label || "Apple Watch");
    return NextResponse.json({ token, name: me.full_name?.split(" ")[0] ?? null }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "couldn't link" }, { status: 500 });
  }
}

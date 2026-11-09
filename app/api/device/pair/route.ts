import { NextResponse } from "next/server";

import { DEVICE_KINDS, startPairing, type DeviceKind } from "@/lib/devices/auth";
import { createAdminClient } from "@/lib/supabase/server";

// A watch or TV asks for a pairing code to show. Public: the device has no account yet.
// Body: { kind: "garmin_watch" | "apple_tv", label?: string }.
// Answers { code, secret, expiresIn, pollEvery }; the device keeps `secret` and polls /pair/poll.

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { kind?: string; label?: string } | null;
  const kind = body?.kind as DeviceKind;
  if (!DEVICE_KINDS.includes(kind)) return NextResponse.json({ error: "bad kind" }, { status: 400 });

  // Crude flood guard: a small team never has hundreds of codes open at once.
  const { count } = await createAdminClient().from("device_pairings").select("code", { count: "exact", head: true }).gt("expires_at", new Date().toISOString());
  if ((count ?? 0) > 200) return NextResponse.json({ error: "busy" }, { status: 429 });

  const label = typeof body?.label === "string" ? body.label.replace(/[^\p{L}\p{N} '’()-]/gu, "").trim() : null;
  try {
    const { code, secret } = await startPairing(kind, label);
    return NextResponse.json({ code, secret, expiresIn: 600, pollEvery: 5 });
  } catch {
    return NextResponse.json({ error: "Couldn't make a code" }, { status: 500 });
  }
}

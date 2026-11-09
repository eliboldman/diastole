import { NextResponse } from "next/server";

import { pollPairing } from "@/lib/devices/auth";

// The device asks whether its code has been typed in. Body: { secret }.
// Answers { status: "waiting" } | { status: "expired" } | { status: "linked", token, name }.
// The token is shown exactly once; only its hash is kept.

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { secret?: string } | null;
  const secret = typeof body?.secret === "string" ? body.secret : "";
  if (secret.length < 20 || secret.length > 100) return NextResponse.json({ status: "expired" });
  try {
    return NextResponse.json(await pollPairing(secret), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "try again" }, { status: 500 });
  }
}

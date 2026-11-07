import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { runEvening } from "@/lib/evening";

// Vercel Cron calls this each evening (see vercel.json): "pack for tomorrow" and worn-shoe nudges.
export const maxDuration = 120;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });
  const result = await runEvening().catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
  console.info("Evening run", result);
  return NextResponse.json({ ok: true, result });
}

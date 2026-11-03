import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { runCoachAssistant } from "@/lib/ai/coach";
import { createAdminClient } from "@/lib/supabase/server";

// Vercel Cron calls this once each morning (see vercel.json) with `Authorization: Bearer <CRON_SECRET>`.
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });

  const admin = createAdminClient();
  const { data: coaches } = await admin.from("profiles").select("id").eq("role", "coach");
  const results: Record<string, unknown> = {};
  for (const c of coaches ?? []) {
    results[c.id] = await runCoachAssistant(c.id, "cron").catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
  }
  console.info("Morning coach assistant", results);
  return NextResponse.json({ ok: true, results });
}

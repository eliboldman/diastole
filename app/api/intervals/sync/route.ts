import { NextResponse } from "next/server";

import { syncAthlete } from "@/lib/intervals/sync";

// Pinged by the database when a connected athlete's bike workout or FTP changes (migration
// 20261225). The ping holds only the athlete id; syncAthlete does nothing unless that athlete is
// marked dirty, so a forged or repeated ping can't cause extra work beyond a cheap check.

const UUID = /^[0-9a-f-]{36}$/i;
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { athlete?: unknown } | null;
  const athlete = body?.athlete;
  if (typeof athlete !== "string" || !UUID.test(athlete)) return NextResponse.json({ ok: false }, { status: 400 });
  // A small wait lets a burst of edits (bulk send, plan apply) land before one sync covers them all.
  await new Promise((r) => setTimeout(r, 1500));
  const result = await syncAthlete(athlete);
  return NextResponse.json({ ok: true, status: result.status });
}

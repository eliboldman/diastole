import { NextResponse } from "next/server";

import { runProteinNudges } from "@/lib/fuel/protein-nudge-run";

// Pinged every 5 minutes by the database scheduler (pg_cron, migration 20270126). The ping carries
// nothing and only sends nudges that are due and not yet claimed, so extra pings send nothing new.
export const maxDuration = 60;

async function run() {
  const result = await runProteinNudges().catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
  if (result.status !== "ok" || ("sent" in result && (result.sent || result.ate))) console.info("Protein nudges", result);
  return NextResponse.json({ ok: result.status === "ok" });
}

export const POST = run;
export const GET = run;

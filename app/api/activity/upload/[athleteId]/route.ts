import { NextResponse, type NextRequest } from "next/server";

import { readAndSave } from "@/lib/activity/upload";
import { createAdminClient, getProfile } from "@/lib/supabase/server";

// One workout file (FIT) uploaded by hand or by the iPhone ride screen. See lib/activity/upload.ts.

async function authorize(athleteId: string) {
  const me = await getProfile();
  if (!me) return null;
  if (me.id === athleteId) return me;
  if (me.role !== "coach") return null;
  const { data } = await createAdminClient().from("profiles").select("coach_id").eq("id", athleteId).maybeSingle();
  return data?.coach_id === me.id ? me : null;
}

/** Answers { status: "created" | "details_added" | "already_there" | "unreadable", id? }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  if (!(await authorize(athleteId))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return readAndSave(request, athleteId);
}

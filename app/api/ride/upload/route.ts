import { NextResponse } from "next/server";

import { readAndSave } from "@/lib/activity/upload";
import { getProfile } from "@/lib/supabase/server";

// A ride recorded on the iPhone/iPad ride screen (FIT body, signed-in web session via the app's
// web view). Same handling as hand uploads.

export async function POST(request: Request) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "signed out" }, { status: 401 });
  return readAndSave(request, me.id);
}

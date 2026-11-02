import { NextResponse, type NextRequest } from "next/server";

import { disconnectGarmin } from "@/lib/garmin/client";
import { getProfile } from "@/lib/supabase/server";

// Athlete-initiated disconnect. Garmin requires calling their DELETE registration endpoint here.
export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl;
  const profile = await getProfile();
  if (!profile) return NextResponse.redirect(`${origin}/login`, { status: 303 });
  await disconnectGarmin(profile.id);
  return NextResponse.redirect(`${origin}/connect?garmin=disconnected`, { status: 303 });
}

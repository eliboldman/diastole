import { NextResponse, type NextRequest } from "next/server";

import { exchangeCode, fetchGarminUserId, saveTokens } from "@/lib/garmin/client";
import { createAdminClient, getProfile } from "@/lib/supabase/server";

// Step 2 of Garmin OAuth: Garmin sends the athlete back here with a one-time code.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${origin}/connect?garmin=${reason}`);
    res.cookies.delete({ name: "garmin_oauth", path: "/api/garmin" });
    return res;
  };

  const profile = await getProfile();
  if (!profile) return NextResponse.redirect(`${origin}/login`);

  const code = searchParams.get("code");
  if (!code) return fail("declined");

  let saved: { verifier: string; state: string } | null = null;
  try {
    saved = JSON.parse(request.cookies.get("garmin_oauth")?.value ?? "null");
  } catch {}
  if (!saved || saved.state !== searchParams.get("state")) return fail("expired");

  try {
    const tokens = await exchangeCode(code, saved.verifier, `${origin}/api/garmin/callback`, saved.state);
    const garminUserId = await fetchGarminUserId(tokens.access_token);

    const admin = createAdminClient();
    // If this Garmin account was linked to someone else before, release it.
    await admin.from("device_connections").delete().eq("source", "garmin").eq("external_user_id", garminUserId)
      .neq("athlete_id", profile.id);
    const { error } = await admin.from("device_connections").upsert(
      { athlete_id: profile.id, source: "garmin", external_user_id: garminUserId, connected_at: new Date().toISOString() },
      { onConflict: "athlete_id,source" },
    );
    if (error) throw error;
    await saveTokens(profile.id, tokens);
  } catch (e) {
    console.error("Garmin connect failed", e);
    return fail("error");
  }

  const res = NextResponse.redirect(`${origin}/connect?garmin=connected`);
  res.cookies.delete({ name: "garmin_oauth", path: "/api/garmin" });
  return res;
}

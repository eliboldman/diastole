import { NextResponse, type NextRequest } from "next/server";

import { GARMIN_AUTHORIZE_URL, garminClientId, garminConfigured, newPkce } from "@/lib/garmin/client";
import { getProfile } from "@/lib/supabase/server";

// Step 1 of Garmin OAuth: send the signed-in athlete to Garmin's consent screen.
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  // Always use the canonical site URL so the redirect matches what's registered with Garmin,
  // even if the athlete arrived via an old or preview domain.
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || origin;
  const profile = await getProfile();
  if (!profile) return NextResponse.redirect(`${origin}/login`);
  if (!garminConfigured()) return NextResponse.redirect(`${origin}/connect?garmin=unavailable`);

  const { verifier, challenge, state } = newPkce();
  const url = new URL(GARMIN_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: garminClientId(),
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: `${base}/api/garmin/callback`,
    state,
    // Not in Garmin's PDF, but sent by Garmin's own OAuth2 tool.
    permissionsUpdated: "true",
    selectedCapabilities: "COMBINED",
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set("garmin_oauth", JSON.stringify({ verifier, state }), {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    path: "/api/garmin",
    maxAge: 600,
  });
  return res;
}

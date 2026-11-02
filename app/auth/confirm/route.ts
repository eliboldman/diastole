import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Landing point for sign-in and invite emails: verifies the one-time token and starts a session.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) return NextResponse.redirect(`${origin}/login?error=link`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=link`);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  return NextResponse.redirect(`${origin}${profile?.role === "coach" ? "/dashboard" : "/connect"}`);
}

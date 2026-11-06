import { NextResponse, type NextRequest } from "next/server";

import { createClient, getProfile } from "@/lib/supabase/server";

// The iPhone app posts its device token here through the signed-in page, so it's tied to that user.
export async function POST(request: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  let body: { token?: unknown; environment?: unknown; version?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.toLowerCase() : "";
  if (!/^[0-9a-f]{64,200}$/.test(token)) return NextResponse.json({ ok: false }, { status: 400 });
  const environment = body.environment === "sandbox" ? "sandbox" : "production";
  const version = typeof body.version === "string" ? body.version.slice(0, 40) : null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_push_token", { p_token: token, p_platform: "ios", p_environment: environment, p_app_version: version });
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}

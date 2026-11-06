import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createClient, getProfile } from "@/lib/supabase/server";

// The iPhone app reports which workouts it put on (or took off) the Apple Watch.
const Body = z.object({ sent: z.array(z.uuid()).max(50), removed: z.array(z.uuid()).max(200) });

export async function POST(request: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("apple_ack_workouts", { p_sent: body.sent, p_removed: body.removed });
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}

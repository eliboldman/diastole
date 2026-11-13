import { NextResponse, type NextRequest } from "next/server";

import { createClient, getProfile } from "@/lib/supabase/server";

// Actions from an iPhone notification without opening the app (QuickActions.swift): "Had protein"
// logs a recovery protein entry; "Reply" answers a message. Uses the app's own sign-in cookies.
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ ok: false, error: "signed out" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { action?: string; conversation?: string; text?: string } | null;
  const supabase = await createClient();

  if (body?.action === "protein") {
    const now = new Date();
    const local = now.toLocaleDateString("en-CA", { timeZone: me.timezone });
    const { error } = await supabase.from("meal_logs").insert({
      athlete_id: me.id,
      local_date: local,
      eaten_at: now.toISOString(),
      label: "Recovery protein",
      items: [{ name: "Recovery protein (quick log)", portion: "about 30 g protein", scale: 1, carbs_g: 0, protein_g: 30, fat_g: 0 }],
      carbs_g: 0,
      protein_g: 30,
      fat_g: 0,
      source: "text",
      note: "Logged from the reminder. Edit it on Fuel if it was something specific.",
    });
    return NextResponse.json({ ok: !error });
  }

  if (body?.action === "reply" && body.conversation && UUID.test(body.conversation)) {
    const text = String(body.text ?? "").trim().slice(0, 2000);
    if (!text) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
    // Row-level security: only a member of the conversation can post in it.
    const { error } = await supabase.from("messages").insert({ id: crypto.randomUUID(), conversation_id: body.conversation, sender_id: me.id, body: text });
    return NextResponse.json({ ok: !error });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}

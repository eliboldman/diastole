import { logEvent } from "@/lib/system/heartbeat";
import { NextResponse, type NextRequest } from "next/server";

import { apnsConfigured, isDeadToken, sendPush, type ApnsEnv } from "@/lib/push/apns";
import { apnsSound, asSound, groupOf, soundGroup } from "@/lib/push/sounds";
import { createAdminClient } from "@/lib/supabase/server";

// Pinged by the database when a bell notification is created or refreshed (see migration 20261201).
// The ping holds only an id; we push only a version of that notification not pushed yet, and only
// to its own recipient, so a forged or repeated ping can't send anything new.

const UUID = /^[0-9a-f-]{36}$/i;
const FRESH_MS = 10 * 60_000;

export async function POST(request: NextRequest) {
  let id: unknown;
  try {
    id = ((await request.json()) as { id?: unknown }).id;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (typeof id !== "string" || !UUID.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  if (!apnsConfigured()) return NextResponse.json({ ok: true, skipped: "not configured" });

  const admin = createAdminClient();
  const { data: n } = await admin.from("notifications").select("id, user_id, actor_id, kind, title, body, href, meta, created_at, pushed_at, read_at, dismissed_at").eq("id", id).maybeSingle();
  if (!n || n.read_at || n.dismissed_at) return NextResponse.json({ ok: true, skipped: "gone" });
  if (Date.now() - new Date(n.created_at).getTime() > FRESH_MS) return NextResponse.json({ ok: true, skipped: "stale" });
  if (n.pushed_at && n.pushed_at >= n.created_at) return NextResponse.json({ ok: true, skipped: "already pushed" });
  // Claim this version so concurrent pings send it once.
  const claim = admin.from("notifications").update({ pushed_at: new Date().toISOString() }).eq("id", n.id).eq("created_at", n.created_at);
  const { data: claimed } = await (n.pushed_at ? claim.eq("pushed_at", n.pushed_at) : claim.is("pushed_at", null)).select("id");
  if (!claimed?.length) return NextResponse.json({ ok: true, skipped: "raced" });

  const [{ data: tokens }, { data: profile }, { count: unread }] = await Promise.all([
    admin.from("push_tokens").select("token, environment").eq("user_id", n.user_id).eq("platform", "ios"),
    admin.from("profiles").select("push_sounds, coach_id").eq("id", n.user_id).maybeSingle(),
    admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", n.user_id).is("read_at", null).is("dismissed_at", null),
  ]);
  if (!tokens?.length) return NextResponse.json({ ok: true, skipped: "no devices" });

  const meta = n.meta as Record<string, unknown> | null;
  const group = groupOf(n.kind, meta);
  // Anything the athlete's own coach sends (messages, workouts, briefs) plays the coach sound.
  const fromOwnCoach = Boolean(n.actor_id && profile?.coach_id && n.actor_id === profile.coach_id && n.actor_id !== n.user_id);
  const sg = soundGroup(n.kind, meta, fromOwnCoach);
  const sound = apnsSound(sg ? asSound((profile?.push_sounds as Record<string, unknown> | null)?.[sg], sg) : "tone");
  const payload = {
    aps: {
      alert: { title: n.title, ...(n.body ? { body: n.body } : {}) },
      ...(sound ? { sound } : {}),
      badge: unread ?? 1,
      "thread-id": group ?? n.kind,
    },
    href: n.href ?? "/",
  };

  const results = await sendPush(tokens as { token: string; environment: ApnsEnv }[], payload, n.id);
  const dead = results.filter(isDeadToken).map((r) => r.token);
  if (dead.length) await admin.from("push_tokens").delete().in("token", dead);
  const failed = results.filter((r) => r.status !== 200 && !isDeadToken(r));
  if (failed.length) {
    console.warn("APNs failures", failed.map((f) => ({ status: f.status, reason: f.reason })));
    await logEvent("apns_failure", { kind: n.kind, failures: failed.map((f) => ({ status: f.status, reason: f.reason })) });
  }
  return NextResponse.json({ ok: true, sent: results.filter((r) => r.status === 200).length, removed: dead.length });
}

import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";

import { createAdminClient, type Profile } from "@/lib/supabase/server";

// Sign-in for devices that can't show the website: the Garmin watch app and the Apple TV app.
// The device asks for a pairing code, the athlete types it on diastole.app, and the device's next
// poll gets a bearer token. Only sha256 hashes of secrets and tokens are stored.

export type DeviceKind = "garmin_watch" | "garmin_field" | "apple_tv";
export const DEVICE_KINDS: DeviceKind[] = ["garmin_watch", "garmin_field", "apple_tv"];
export const DEVICE_NAMES: Record<DeviceKind, string> = { garmin_watch: "Garmin watch", garmin_field: "Garmin fuel field", apple_tv: "Apple TV" };

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const secret = () => randomBytes(32).toString("base64url");

export function newCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

/** Starts a pairing: returns the code to show and the secret the device polls with. */
export async function startPairing(kind: DeviceKind, label: string | null) {
  const admin = createAdminClient();
  // Expired codes are cleared as new ones are made.
  await admin.from("device_pairings").delete().lt("expires_at", new Date().toISOString());
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const pollSecret = secret();
    const { error } = await admin.from("device_pairings").insert({ code, kind, label: label?.slice(0, 60) || null, secret_hash: hash(pollSecret) });
    if (!error) return { code, secret: pollSecret };
    if (error.code !== "23505") throw new Error(error.message); // only retry on a code collision
  }
  throw new Error("Couldn't make a pairing code");
}

export type PollResult = { status: "waiting" } | { status: "expired" } | { status: "linked"; token: string; name: string | null };

/** The device asks whether its code was typed in yet. On success the pairing becomes a device link. */
export async function pollPairing(pollSecret: string): Promise<PollResult> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("device_pairings").select("code, kind, label, athlete_id, expires_at").eq("secret_hash", hash(pollSecret)).maybeSingle();
  if (!p) return { status: "expired" };
  if (!p.athlete_id) return new Date(p.expires_at) < new Date() ? { status: "expired" } : { status: "waiting" };

  // Delete first so two racing polls can't both mint a token.
  const { data: taken } = await admin.from("device_pairings").delete().eq("code", p.code).select("code");
  if (!taken?.length) return { status: "expired" };
  const token = secret();
  const { error } = await admin.from("device_links").insert({ athlete_id: p.athlete_id, kind: p.kind, label: p.label, token_hash: hash(token), last_seen_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  const { data: prof } = await admin.from("profiles").select("full_name").eq("id", p.athlete_id).maybeSingle();
  return { status: "linked", token, name: prof?.full_name?.split(" ")[0] ?? null };
}

export type DeviceAuth = { linkId: string; kind: DeviceKind; profile: Profile };

/** Reads `Authorization: Bearer <token>`. Null when missing, unknown or revoked. */
export async function deviceFromRequest(request: Request): Promise<DeviceAuth | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S{20,200})$/i)?.[1];
  if (!token) return null;
  const admin = createAdminClient();
  const { data: link } = await admin.from("device_links").select("id, kind, athlete_id, last_seen_at").eq("token_hash", hash(token)).maybeSingle();
  if (!link) return null;
  const { data: profile } = await admin.from("profiles").select("id, role, coach_id, full_name, email, timezone, units").eq("id", link.athlete_id).maybeSingle();
  if (!profile) return null;
  // Touch last_seen at most every 10 minutes (watches poll often).
  if (!link.last_seen_at || Date.now() - new Date(link.last_seen_at).getTime() > 10 * 60_000) {
    await admin.from("device_links").update({ last_seen_at: new Date().toISOString() }).eq("id", link.id);
  }
  return { linkId: link.id, kind: link.kind as DeviceKind, profile: profile as Profile };
}

/** The device signs itself out. */
export async function revokeDevice(linkId: string) {
  await createAdminClient().from("device_links").delete().eq("id", linkId);
}

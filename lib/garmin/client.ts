import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/server";

// Garmin Connect Developer Program, OAuth 2.0 PKCE (per Garmin's OAuth2PKCE spec).
// Garmin's own OAuth2 tool uses the /partner/ path; the PDF's path without it yields codes the token endpoint rejects (HTTP 500).
export const GARMIN_AUTHORIZE_URL = "https://connect.garmin.com/partner/oauth2Confirm";
// Garmin's PDF names connectapi.garmin.com, but tokens issued by Garmin's own tool carry
// iss=https://diauth.garmin.com. We try both hosts and both client-auth styles, and log which works.
const TOKEN_HOSTS = ["https://diauth.garmin.com", "https://connectapi.garmin.com"];
const TOKEN_PATH = "/di-oauth2-service/oauth/token";
export const GARMIN_API = "https://apis.garmin.com";

export function garminConfigured() {
  return Boolean(process.env.GARMIN_CLIENT_ID && process.env.GARMIN_CLIENT_SECRET);
}

export function newPkce() {
  const verifier = randomBytes(48).toString("base64url"); // 64 chars, within Garmin's 43-128
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(24).toString("base64url");
  return { verifier, challenge, state };
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const id = process.env.GARMIN_CLIENT_ID!;
  const secret = process.env.GARMIN_CLIENT_SECRET!;
  const failures: string[] = [];

  for (const host of TOKEN_HOSTS) {
    for (const auth of ["body", "basic"] as const) {
      const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
      const body = new URLSearchParams(params);
      if (auth === "basic") {
        headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
        body.set("client_id", id); // PKCE token requests still identify the client
      } else {
        body.set("client_id", id);
        body.set("client_secret", secret);
      }

      const res = await fetch(`${host}${TOKEN_PATH}`, { method: "POST", headers, body });
      if (res.ok) {
        if (failures.length) console.info("Garmin token request succeeded", { host, auth, after: failures });
        return res.json();
      }
      failures.push(`${host.replace("https://", "")}/${auth}: ${res.status}`);
    }
  }
  throw new Error(`Garmin token request (${params.grant_type}) failed on every variant: ${failures.join(", ")}`);
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri });
}

export async function saveTokens(athleteId: string, t: TokenResponse) {
  // Garmin recommends refreshing at least 600s early.
  const expiresAt = new Date(Date.now() + (t.expires_in - 600) * 1000).toISOString();
  const { error } = await createAdminClient().rpc("save_garmin_tokens", {
    p_athlete: athleteId,
    p_access: t.access_token,
    p_refresh: t.refresh_token,
    p_expires_at: expiresAt,
  });
  if (error) throw error;
}

/** A valid access token for this athlete, refreshing it first if it's about to expire. */
export async function accessTokenFor(athleteId: string): Promise<string> {
  const { data, error } = await createAdminClient().rpc("get_garmin_tokens", { p_athlete: athleteId });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("Athlete has no Garmin connection.");

  if (new Date(row.expires_at).getTime() > Date.now()) return row.access_token;

  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: row.refresh_token });
  await saveTokens(athleteId, fresh);
  return fresh.access_token;
}

export async function garminFetch(athleteId: string, path: string, init: RequestInit = {}) {
  const token = await accessTokenFor(athleteId);
  return fetch(`${GARMIN_API}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
}

export async function fetchGarminUserId(accessToken: string): Promise<string> {
  const res = await fetch(`${GARMIN_API}/wellness-api/rest/user/id`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Garmin user id failed: ${res.status}`);
  return (await res.json()).userId;
}

/** Remove the connection on Garmin's side, then ours. */
export async function disconnectGarmin(athleteId: string) {
  try {
    await garminFetch(athleteId, "/wellness-api/rest/user/registration", { method: "DELETE" });
  } catch {
    // Token may already be revoked (e.g. the athlete removed access in Garmin Connect). Clean up locally anyway.
  }
  await forgetGarmin(athleteId);
}

/** Local cleanup only — used when Garmin tells us the athlete deregistered. */
export async function forgetGarmin(athleteId: string) {
  const admin = createAdminClient();
  await admin.rpc("delete_garmin_tokens", { p_athlete: athleteId });
  await admin.from("device_connections").delete().eq("athlete_id", athleteId).eq("source", "garmin");
}

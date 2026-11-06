import "server-only";

import { createPrivateKey, sign } from "node:crypto";
import { connect, type ClientHttp2Session } from "node:http2";

// Apple Push Notification service over HTTP/2 with token (.p8 key) auth.
// Env: APNS_KEY (the .p8 file contents), APNS_KEY_ID; APNS_TEAM_ID and APNS_BUNDLE_ID have defaults.

const TEAM_ID = process.env.APNS_TEAM_ID?.trim() || "X3B9DZ4SS9";
const BUNDLE_ID = process.env.APNS_BUNDLE_ID?.trim() || "app.diastole.ios";
const HOST = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" } as const;
export type ApnsEnv = keyof typeof HOST;

export const apnsConfigured = () => Boolean(process.env.APNS_KEY?.trim() && process.env.APNS_KEY_ID?.trim());

let jwt: { token: string; at: number } | null = null;
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Provider token, reused for 50 minutes (Apple wants 20-60). */
function providerToken(): string {
  if (jwt && Date.now() - jwt.at < 50 * 60_000) return jwt.token;
  // Vercel env vars may hold the key with literal "\n" instead of newlines.
  const pem = process.env.APNS_KEY!.trim().replace(/\\n/g, "\n");
  const header = b64url(JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID!.trim() }));
  const claims = b64url(JSON.stringify({ iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: createPrivateKey(pem), dsaEncoding: "ieee-p1363" });
  jwt = { token: `${header}.${claims}.${b64url(signature)}`, at: Date.now() };
  return jwt.token;
}

export type ApnsResult = { token: string; status: number; reason?: string };

function sendOne(session: ClientHttp2Session, deviceToken: string, payload: string, collapseId?: string): Promise<ApnsResult> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken()}`,
      "apns-topic": BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 24 * 3600),
    };
    if (collapseId) headers["apns-collapse-id"] = collapseId.slice(0, 64);
    const req = session.request(headers);
    let status = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("response", (h) => (status = Number(h[":status"] ?? 0)));
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let reason: string | undefined;
      try {
        reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
      } catch {}
      resolve({ token: deviceToken, status, reason });
    });
    req.on("error", (e) => resolve({ token: deviceToken, status: 0, reason: e.message }));
    req.setTimeout(10_000, () => {
      req.close();
      resolve({ token: deviceToken, status: 0, reason: "timeout" });
    });
    req.end(payload);
  });
}

/** Sends one payload to each token, grouped by environment. */
export async function sendPush(tokens: { token: string; environment: ApnsEnv }[], payload: object, collapseId?: string): Promise<ApnsResult[]> {
  const body = JSON.stringify(payload);
  const results: ApnsResult[] = [];
  for (const env of ["production", "sandbox"] as const) {
    const mine = tokens.filter((t) => t.environment === env);
    if (!mine.length) continue;
    const session = connect(HOST[env]);
    session.on("error", () => {});
    try {
      results.push(...(await Promise.all(mine.map((t) => sendOne(session, t.token, body, collapseId)))));
    } finally {
      session.close();
    }
  }
  return results;
}

/** Tokens Apple says are dead: remove them. */
export const isDeadToken = (r: ApnsResult) => r.status === 410 || (r.status === 400 && (r.reason === "BadDeviceToken" || r.reason === "DeviceTokenNotForTopic"));

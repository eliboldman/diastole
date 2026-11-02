import "server-only";

import { headers } from "next/headers";

/** Base URL of the current deployment, used in email links. */
export async function siteUrl() {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

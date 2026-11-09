import { NextResponse } from "next/server";

import { deviceFromRequest, revokeDevice } from "@/lib/devices/auth";

// The device signs itself out (its token stops working everywhere).

export async function POST(request: Request) {
  const device = await deviceFromRequest(request);
  if (device) await revokeDevice(device.linkId);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";

import { readAndSave } from "@/lib/activity/upload";
import { deviceFromRequest } from "@/lib/devices/auth";

// A ride recorded on the Apple TV app (FIT file body, bearer token). Same handling as hand uploads.

export async function POST(request: Request) {
  const device = await deviceFromRequest(request);
  if (!device) return NextResponse.json({ error: "signed out" }, { status: 401 });
  if (device.kind !== "apple_tv") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return readAndSave(request, device.profile.id);
}

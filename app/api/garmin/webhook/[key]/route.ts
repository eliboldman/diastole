import type { NextRequest } from "next/server";

import { handleGarminPush } from "../route";

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  return handleGarminPush(request, (await params).key);
}

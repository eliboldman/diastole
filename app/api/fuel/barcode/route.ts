import { NextResponse, type NextRequest } from "next/server";

import { isBarcode, productItem } from "@/lib/fuel/barcode";
import { getProfile } from "@/lib/supabase/server";

// Looks up a packaged food by barcode in Open Food Facts (free, open data). Only the barcode is sent.
export async function GET(request: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in again, then retry." }, { status: 401 });
  const code = (request.nextUrl.searchParams.get("code") ?? "").replace(/\D/g, "");
  if (!isBarcode(code)) return NextResponse.json({ ok: false, error: "That doesn't look like a barcode." }, { status: 400 });
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,serving_size,serving_quantity,nutriments`, {
      headers: { "User-Agent": "Diastole/1.0 (https://diastole.app)" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: "Couldn't find that product. Try a photo instead." });
    const data = (await res.json()) as { status?: number; product?: Parameters<typeof productItem>[0] };
    const found = data.status === 1 ? productItem(data.product) : null;
    if (!found) return NextResponse.json({ ok: false, error: "That product has no nutrition info yet. Try a photo instead." });
    return NextResponse.json({ ok: true, item: found.item, label: found.label });
  } catch {
    return NextResponse.json({ ok: false, error: "The food database didn't answer. Try again or use a photo." });
  }
}

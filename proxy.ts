import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages anyone can open without signing in.
const PUBLIC_PATHS = ["/", "/privacy", "/login", "/forgot-password", "/auth", "/api/garmin/webhook", "/api/cron", "/api/push/deliver", "/api/device", "/api/intervals/sync"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

// Keeps the Supabase session fresh and sends signed-out visitors to /login.
// Role checks (coach vs athlete) happen in the page layouts, not here.
// Old production address (before the rename to diastole.app). Everything redirects to the
// canonical site, except Garmin webhooks, which keep working in case Garmin retries old deliveries.
const LEGACY_HOSTS = new Set(["physiology-os-eta.vercel.app"]);

export async function proxy(request: NextRequest) {
  const canonical = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (
    canonical &&
    LEGACY_HOSTS.has(request.nextUrl.hostname) &&
    !request.nextUrl.pathname.startsWith("/api/garmin/webhook")
  ) {
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, canonical);
    return NextResponse.redirect(target, 308);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && !isPublic(request.nextUrl.pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mjs)$).*)"],
};

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useState } from "react";

import PublicShell from "@/components/PublicShell";

// Landing page for sign-in and invite emails. Supabase's standard emails put the
// session in the URL fragment (#access_token=...), which only the browser can read,
// so this runs client-side, stores the session in cookies, then hands off to /login,
// which routes coaches to /dashboard and athletes to /connect.
export default function AuthCallback() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { detectSessionInUrl: false } },
    );

    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const code = new URLSearchParams(window.location.search).get("code");

    // Invites and password resets land on /set-password; everything else goes to /login, which routes by role.
    const type = hash.get("type");
    const next = type === "invite" || type === "recovery" ? "/set-password" : "/login";
    const finish = (ok: boolean) => (ok ? window.location.replace(next) : setFailed(true));

    if (accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => finish(!error));
    } else if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => finish(!error));
    } else {
      // Expired or already-used links arrive here with an error in the fragment.
      // State is set from a timer callback, not synchronously in the effect body.
      setTimeout(() => setFailed(true), 0);
    }
  }, []);

  return (
    <PublicShell>
      <div className="mx-auto max-w-sm pt-24 text-center">
        {failed ? (
          <>
            <h1 className="text-2xl font-medium">That link didn&apos;t work</h1>
            <p className="mt-3 text-white/55">It may have expired or already been used.</p>
            <a href="/login" className="mt-6 inline-block text-emerald-200 hover:underline">
              Back to sign in →
            </a>
          </>
        ) : (
          <p className="text-white/55">Signing you in…</p>
        )}
      </div>
    </PublicShell>
  );
}

import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** Supabase client acting as the signed-in user (row-level security applies). */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes sessions.
        }
      },
    },
  });
}

/** Server-only client that bypasses row-level security. Use sparingly (invites, Garmin sync). */
export function createAdminClient() {
  return createPlainClient(url, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Profile = {
  id: string;
  role: "coach" | "athlete";
  coach_id: string | null;
  full_name: string | null;
  email: string | null;
  timezone: string;
};

/** The signed-in user's profile, or null when signed out. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, coach_id, full_name, email, timezone")
    .eq("id", data.user.id)
    .single();
  return profile;
}

export async function requireUser(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireCoach(): Promise<Profile> {
  const profile = await requireUser();
  if (profile.role !== "coach") redirect("/me");
  return profile;
}

"use server";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createAdminClient, createClient, requireCoach, requireUser } from "@/lib/supabase/server";

// A coach can step into their own demo athlete's account (to try the athlete side) and back.
// Only accounts marked is_demo on that coach's roster; the way back needs a signed cookie that
// only this coach's browser got when it stepped in.
export const DEMO_COOKIE = "d_demo_return";
const sign = (coachId: string) => createHmac("sha256", process.env.SUPABASE_SECRET_KEY ?? "").update(`demo-return:${coachId}`).digest("base64url");

async function signInAs(email: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const token = data?.properties?.hashed_token;
  if (error || !token) throw new Error(`Couldn't switch accounts: ${error?.message ?? "no token"}`);
  const supabase = await createClient();
  const { error: e } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: token });
  if (e) throw new Error(`Couldn't switch accounts: ${e.message}`);
}

export async function openDemoAthlete(athleteId: string) {
  const coach = await requireCoach();
  const admin = createAdminClient();
  const { data: a } = await admin.from("profiles").select("email, coach_id, is_demo").eq("id", athleteId).maybeSingle();
  if (!a?.is_demo || a.coach_id !== coach.id || !a.email) throw new Error("Not your demo athlete.");
  (await cookies()).set(DEMO_COOKIE, `${coach.id}.${sign(coach.id)}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 12 * 3600 });
  await signInAs(a.email);
  redirect("/me");
}

export async function backToCoach() {
  const me = await requireUser();
  const jar = await cookies();
  const [coachId, sig] = (jar.get(DEMO_COOKIE)?.value ?? "").split(".");
  const admin = createAdminClient();
  const { data: self } = await admin.from("profiles").select("is_demo, coach_id").eq("id", me.id).maybeSingle();
  const good = sig && Buffer.from(sig).length === Buffer.from(sign(coachId)).length && timingSafeEqual(Buffer.from(sig), Buffer.from(sign(coachId)));
  if (!self?.is_demo || self.coach_id !== coachId || !good) {
    jar.delete(DEMO_COOKIE);
    redirect("/login");
  }
  const { data: coach } = await admin.from("profiles").select("email").eq("id", coachId).maybeSingle();
  if (!coach?.email) redirect("/login");
  await signInAs(coach.email);
  jar.delete(DEMO_COOKIE);
  redirect("/athletes");
}

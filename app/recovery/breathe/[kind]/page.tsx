import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BreathPlayer from "@/components/breath/BreathPlayer";
import { breathPace } from "@/lib/breath/data";
import { DEFAULT_PACE, isKind, SESSIONS } from "@/lib/breath/plan";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Breathe · Diastole" };

/** One guided breathing session, full screen. `?m=` picks the length (from the session's choices). */
export default async function BreathSessionPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ kind }, sp] = await Promise.all([params, searchParams]);
  if (!isKind(kind)) notFound();
  const me = await requireUser();
  const supabase = await createClient();
  const pace = (await breathPace(supabase, me.id)) ?? DEFAULT_PACE;
  const info = SESSIONS[kind];
  const want = Number(sp.m);
  const minutes = info.minutes.includes(want) ? [want, ...info.minutes.filter((m) => m !== want)] : info.minutes;
  return <BreathPlayer kind={kind} title={info.title} why={info.why} minutes={minutes} pace={pace} backHref="/recovery/breathe" />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import RecoveryPlayer from "@/components/recovery/RecoveryPlayer";
import { resolveRoutine, videoMap } from "@/lib/recovery/data";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Recovery · Diastole" };

/** The follow-along player for a starter, a coach routine, or an assignment ("a-<id>"). */
export default async function RecoveryPlay({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ from?: string; s?: string }> }) {
  await requireUser();
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [routine, media] = await Promise.all([resolveRoutine(supabase, key), videoMap(supabase)]);
  if (!routine || !routine.items.length) notFound();
  // Only return to pages inside the app.
  const back = sp.from && /^\/[a-z0-9/_-]*$/i.test(sp.from) ? sp.from : "/recovery";
  return (
    <RecoveryPlayer
      title={routine.title}
      items={routine.items}
      media={media}
      assignmentId={routine.assignmentId}
      source={routine.assignmentId ? "assigned" : sp.s === "suggested" ? "suggested" : "self"}
      backHref={back}
    />
  );
}

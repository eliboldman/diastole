import type { ReactNode } from "react";

import { requireCoach } from "@/lib/supabase/server";

// Every page in this folder is coach-only. Athletes are sent to /connect.
export default async function CoachLayout({ children }: { children: ReactNode }) {
  await requireCoach();
  return children;
}

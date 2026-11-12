import type { ReactNode } from "react";

import { requireStaff } from "@/lib/supabase/server";

// Coach pages. Team dietitians pass the layout too (for the athlete pages); every other page
// calls requireCoach itself, which sends a dietitian to /nutrition.
export default async function CoachLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return children;
}

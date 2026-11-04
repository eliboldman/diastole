import type { ReactNode } from "react";

import DashboardShell from "@/components/layout/DashboardShell";

/** Signed-in pages outside the coach area. Same hover sidebar and bottom tabs as the coach,
 *  with the athlete menu, or the coach menu when a coach is looking at their own athlete view. */
export default function AthleteShell({ children, isCoach = false }: { children: ReactNode; isCoach?: boolean }) {
  return <DashboardShell role={isCoach ? "coach" : "athlete"}>{children}</DashboardShell>;
}

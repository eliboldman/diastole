import { cookies } from "next/headers";
import type { ReactNode } from "react";

import PhysiologyBackground from "@/components/PhysiologyBackground";
import RoleCookie from "@/components/layout/RoleCookie";
import ShellBack from "@/components/layout/ShellBack";
import Sidebar, { type NavRole } from "@/components/layout/Sidebar";
import { tabsFromCookie, TABS_COOKIE } from "@/lib/tabs";

type Tone = "green" | "yellow" | "red" | "blue" | null;

export default async function DashboardShell({ children, tone = "green", role = "coach" }: { children: ReactNode; tone?: Tone; role?: NavRole }) {
  // Each person's own bottom tabs (Settings → Bottom tabs), from the cookie so they draw at once.
  const tabs = tabsFromCookie((await cookies()).get(TABS_COOKIE)?.value, role);
  return (
    <main className="relative min-h-screen overflow-clip app-canvas text-white">
      <PhysiologyBackground variant="atmosphere" systemTone={tone} stressOpacity={0.15} />
      <ShellBack>
        <Sidebar role={role} tabs={tabs} />
        <RoleCookie role={role} />
        <div className="page-breathe-in relative z-10 mx-auto max-w-6xl px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:px-8 md:py-10 md:pl-28">{children}</div>
      </ShellBack>
    </main>
  );
}

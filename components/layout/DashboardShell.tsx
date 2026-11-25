import { cookies } from "next/headers";
import type { ReactNode } from "react";

import PhysiologyBackground from "@/components/PhysiologyBackground";
import RoleCookie from "@/components/layout/RoleCookie";
import DemoBanner from "@/components/demo/DemoBanner";
import ShellBack from "@/components/layout/ShellBack";
import Sidebar, { type NavRole } from "@/components/layout/Sidebar";
import { createClient } from "@/lib/supabase/server";
import { tabsFromCookie, TABS_COOKIE } from "@/lib/tabs";

/** Grit balance for the top-bar pill (sum of the person's own ledger). Null when it can't be read. */
async function gritBalance(): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    const id = auth?.claims?.sub;
    if (!id) return null;
    const { data, error } = await supabase.from("grit_ledger").select("amount").eq("athlete_id", id).limit(10000);
    if (error) return null;
    return (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  } catch {
    return null;
  }
}

type Tone = "green" | "yellow" | "red" | "blue" | null;

export default async function DashboardShell({ children, tone = "green", role = "coach", wide = false }: { children: ReactNode; tone?: Tone; role?: NavRole; wide?: boolean }) {
  // Each person's own bottom tabs (Settings → Bottom tabs), from the cookie so they draw at once.
  const jar = await cookies();
  const tabs = tabsFromCookie(jar.get(TABS_COOKIE)?.value, role);
  const grit = role === "athlete" ? await gritBalance() : null;
  return (
    <main className="relative min-h-screen overflow-clip app-canvas text-white">
      <PhysiologyBackground variant="atmosphere" systemTone={tone} stressOpacity={0.15} />
      <ShellBack>
        <Sidebar role={role} tabs={tabs} grit={grit} />
        <RoleCookie role={role} />
        <div className={`page-breathe-in relative z-10 mx-auto ${wide ? "max-w-[112rem]" : "max-w-6xl"} px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:px-8 md:py-10 md:pl-28`}>
          {jar.get("d_demo_return") && <DemoBanner />}
          {children}
        </div>
      </ShellBack>
    </main>
  );
}

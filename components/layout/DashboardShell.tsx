import type { ReactNode } from "react";

import PhysiologyBackground from "@/components/PhysiologyBackground";
import Sidebar from "@/components/layout/Sidebar";

type Tone = "green" | "yellow" | "red" | "blue" | null;

export default function DashboardShell({ children, tone = "green" }: { children: ReactNode; tone?: Tone }) {
  return (
    <main className="relative min-h-screen overflow-hidden app-canvas text-white">
      <PhysiologyBackground variant="atmosphere" systemTone={tone} stressOpacity={0.15} />
      <Sidebar />
      <div className="page-breathe-in relative z-10 mx-auto max-w-6xl px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] sm:px-8 md:py-10 md:pl-28">{children}</div>
    </main>
  );
}

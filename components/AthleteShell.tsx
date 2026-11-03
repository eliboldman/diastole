import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import PhysiologyBackground from "@/components/PhysiologyBackground";

export default function AthleteShell({ children, isCoach = false }: { children: ReactNode; isCoach?: boolean }) {
  return (
    <main className="relative min-h-screen overflow-hidden app-canvas text-white">
      <PhysiologyBackground variant="atmosphere" systemTone="green" stressOpacity={0.15} />
      <div className="page-breathe-in relative z-10 mx-auto max-w-5xl px-4 py-6 sm:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/me" className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-medium tracking-tight">Diastole</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm text-white/60 sm:gap-2">
            <Link href="/me" className="flex min-h-11 items-center rounded-xl px-2.5 transition hover:bg-white/[0.06] hover:text-white">Home</Link>
            <Link href="/connect" className="flex min-h-11 items-center rounded-xl px-2.5 transition hover:bg-white/[0.06] hover:text-white">Device</Link>
            {isCoach && <Link href="/dashboard" className="flex min-h-11 items-center rounded-xl px-2.5 transition hover:bg-white/[0.06] hover:text-white">Coach</Link>}
            <form action="/auth/signout" method="post">
              <button className="flex min-h-11 items-center rounded-xl px-2.5 transition hover:bg-white/[0.06] hover:text-white">Sign out</button>
            </form>
          </nav>
        </header>
        <div className="pt-10">{children}</div>
      </div>
    </main>
  );
}

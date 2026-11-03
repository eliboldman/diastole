import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import PhysiologyBackground from "@/components/PhysiologyBackground";

export default function AthleteShell({ children, isCoach = false }: { children: ReactNode; isCoach?: boolean }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 text-white">
      <PhysiologyBackground variant="atmosphere" systemTone="green" stressOpacity={0.08} />
      <div className="page-breathe-in relative z-10 mx-auto max-w-5xl px-4 py-6 sm:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/me" className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-medium tracking-tight">Diastole</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-white/55">
            <Link href="/me" className="hover:text-white">Home</Link>
            <Link href="/connect" className="hover:text-white">Device</Link>
            {isCoach && <Link href="/dashboard" className="hover:text-white">Coach</Link>}
            <form action="/auth/signout" method="post">
              <button className="hover:text-white">Sign out</button>
            </form>
          </nav>
        </header>
        <div className="pt-10">{children}</div>
      </div>
    </main>
  );
}

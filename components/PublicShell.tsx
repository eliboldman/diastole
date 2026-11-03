import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import PhysiologyBackground from "@/components/PhysiologyBackground";
import { SITE } from "@/lib/site";

export default function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 text-white">
      <PhysiologyBackground variant="atmosphere" systemTone="green" stressOpacity={0.1} />

      <div className="page-breathe-in relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6 sm:px-8 sm:py-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={32} height={32} className="rounded-lg" priority />
            <span className="text-lg font-medium tracking-tight">{SITE.name}</span>
          </Link>

          <nav className="flex items-center gap-5 text-sm text-white/55">
            <Link href="/privacy" className="transition-colors hover:text-white">
              Privacy
            </Link>
            <a href={`mailto:${SITE.contactEmail}`} className="hidden transition-colors hover:text-white sm:inline">
              Contact
            </a>
            <Link
              href="/login"
              className="rounded-full border border-emerald-300/30 bg-emerald-300/15 px-4 py-2 font-medium text-emerald-50 transition active:scale-95 hover:bg-emerald-300/25"
            >
              Log in
            </Link>
          </nav>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="mt-20 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:justify-between">
          <span>
            © {new Date().getFullYear()} {SITE.owner}. {SITE.name} is a coaching tool, not a medical device.
          </span>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-white/70">
              Privacy policy
            </Link>
            <a href={`mailto:${SITE.contactEmail}`} className="hover:text-white/70">
              {SITE.contactEmail}
            </a>
          </span>
        </footer>
      </div>
    </main>
  );
}

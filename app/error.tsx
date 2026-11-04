"use client";

import Link from "next/link";
import { useEffect } from "react";

// Shown when a page fails to load. Keeps the app's look and offers a way forward.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="app-canvas flex min-h-screen items-center justify-center px-6 text-white">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/[0.06] p-8 text-center backdrop-blur-2xl">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-white/60">This page couldn&apos;t load. Your data is safe. Try again, or head back to the start.</p>
        {error.digest && <p className="mt-3 text-xs text-white/35">Reference: {error.digest}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={reset}
            className="min-h-12 rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 text-sm font-medium text-emerald-100 hover:bg-emerald-300/25"
          >
            Try again
          </button>
          <Link href="/" className="flex min-h-12 items-center rounded-2xl border border-white/15 px-5 text-sm text-white/75 hover:bg-white/[0.06]">
            Go to start
          </Link>
        </div>
      </div>
    </main>
  );
}

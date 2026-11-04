import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-canvas flex min-h-screen items-center justify-center px-6 text-white">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/[0.06] p-8 text-center backdrop-blur-2xl">
        <p className="text-sm uppercase tracking-[0.25em] text-white/45">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Nothing here</h1>
        <p className="mt-2 text-sm text-white/60">That page doesn&apos;t exist, or it isn&apos;t shared with you.</p>
        <Link href="/" className="mt-6 inline-flex min-h-12 items-center rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 text-sm font-medium text-emerald-100 hover:bg-emerald-300/25">
          Go to start
        </Link>
      </div>
    </main>
  );
}

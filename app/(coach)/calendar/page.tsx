import DashboardShell from "@/components/layout/DashboardShell";

export default function Page() {
  return (
    <DashboardShell>
      <div className="relative z-10">
        <p className="text-sm uppercase tracking-[0.25em] text-white/35">
          Section
        </p>

        <h1 className="mt-4 text-5xl font-bold tracking-tight">
          Page Title
        </h1>

        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/55">
          This workspace is ready to be built out.
        </p>
      </div>
    </DashboardShell>
  );
}
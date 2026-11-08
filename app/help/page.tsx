import type { Metadata } from "next";
import Link from "next/link";

import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireUser } from "@/lib/supabase/server";
import { WALKTHROUGHS } from "@/lib/walkthroughs";

export const metadata: Metadata = { title: "Help · Diastole" };

/** Help: short walkthrough videos for the person's role, and where to go with questions. */
export default async function HelpPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const { data: files } = await supabase.storage.from("media").list("walkthroughs", { limit: 100 });
  const have = new Set((files ?? []).map((f) => `walkthroughs/${f.name}`));
  const url = (p: string) => supabase.storage.from("media").getPublicUrl(p).data.publicUrl;
  const roles = me.role === "coach" ? (["coach", "athlete"] as const) : (["athlete"] as const);
  const videos = WALKTHROUGHS.filter((w) => (roles as readonly string[]).includes(w.role) && have.has(w.file));

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Help</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">How Diastole works</h1>

      {videos.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-white/15 p-5 text-sm text-white/55">Walkthrough videos are on the way.</p>
      ) : (
        roles.map((role) => {
          const list = videos.filter((v) => v.role === role);
          if (!list.length) return null;
          return (
            <section key={role} className="mt-8">
              {roles.length > 1 && <h2 className="mb-3 text-sm uppercase tracking-[0.15em] text-white/50">{role === "coach" ? "For you as a coach" : "What your athletes see"}</h2>}
              <div className="grid gap-4 sm:grid-cols-2">
                {list.map((v) => (
                  <figure key={v.id} className={`overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] ${v.kind === "tour" ? "sm:col-span-2" : ""}`}>
                    <video src={url(v.file)} controls playsInline preload="metadata" className="mx-auto max-h-[70vh] w-full bg-black object-contain" />
                    <figcaption className="px-4 py-3 text-sm font-medium">{v.title}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          );
        })
      )}

      <section className="mt-8 rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-sm text-white/65">
        <p>
          Still stuck?{" "}
          {me.role === "coach" ? (
            "Reply to any Diastole email."
          ) : (
            <>
              <Link href="/messages" className="text-emerald-200 underline">
                Message your coach
              </Link>
              .
            </>
          )}{" "}
          Tip: press <kbd className="rounded bg-white/10 px-1">/</kbd> or use search to jump anywhere.
        </p>
      </section>
    </DashboardShell>
  );
}

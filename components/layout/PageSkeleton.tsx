import { cookies } from "next/headers";

import DashboardShell from "@/components/layout/DashboardShell";

type Variant = "today" | "list" | "detail" | "chat" | "profile" | "cards";

const Bar = ({ className = "" }: { className?: string }) => <div className={`skeleton rounded-full ${className}`} />;
const Block = ({ className = "" }: { className?: string }) => <div className={`skeleton rounded-[28px] ${className}`} />;

/**
 * What a page looks like while it loads: the real navigation (from the remembered role) and
 * soft placeholders shaped like the content, instead of a blank screen or a spinner.
 */
export default async function PageSkeleton({ variant = "cards" }: { variant?: Variant }) {
  const saved = (await cookies()).get("d_role")?.value;
  const role = saved === "coach" || saved === "dietitian" ? saved : "athlete";
  return (
    <DashboardShell role={role}>
      <div aria-busy="true" aria-label="Loading" className={variant === "chat" || variant === "profile" ? "mx-auto max-w-3xl" : ""}>
        {variant === "profile" ? (
          <div className="flex flex-col items-center">
            <div className="skeleton h-72 w-40 rounded-[80px]" />
            <Bar className="mt-5 h-8 w-48" />
            <Bar className="mt-3 h-4 w-72 max-w-full" />
            <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Block key={i} className="h-24" />
              ))}
            </div>
          </div>
        ) : variant === "chat" ? (
          <>
            <Bar className="h-4 w-24" />
            <div className="mt-4 flex items-center gap-3">
              <div className="skeleton h-11 w-11 rounded-full" />
              <Bar className="h-6 w-40" />
            </div>
            <div className="mt-10 grid gap-3">
              {[56, 40, 64, 32, 48].map((w, i) => (
                <div key={i} className={`flex ${i % 2 ? "justify-end" : ""}`}>
                  <div className="skeleton h-11 rounded-3xl" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <Bar className="h-3 w-28" />
            <Bar className="mt-4 h-9 w-56" />
            {variant === "today" && <Block className="mt-6 h-28" />}
            {variant === "detail" && (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div key={i} className="skeleton h-20 rounded-2xl" />
                ))}
              </div>
            )}
            <div className={`mt-6 grid gap-4 ${variant === "list" ? "" : "lg:grid-cols-2"}`}>
              {(variant === "list" ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3]).map((i) => (
                <Block key={i} className={variant === "list" ? "h-16 !rounded-[24px]" : "h-48"} />
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

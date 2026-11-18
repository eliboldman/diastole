import { cookies } from "next/headers";

import { VIEW_COOKIE } from "@/lib/view";

/** True when a coach has flipped to athlete view (top-bar switch). Pages use it to link to the athlete versions of things. */
export async function inAthleteView(role: string): Promise<boolean> {
  if (role !== "coach") return false;
  return (await cookies()).get(VIEW_COOKIE)?.value === "athlete";
}

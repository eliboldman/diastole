import "server-only";

import { cleanCloset, packFor, shoeWear, type PackItem } from "@/lib/closet";
import { raceDayPack } from "@/lib/race-pack";
import { getShoeMileage } from "@/lib/shoes";
import { createAdminClient } from "@/lib/supabase/server";
import { describe } from "@/lib/workouts/describe";
import { asPlace, getForecast, weatherPack } from "@/lib/weather";
import type { Pool, PoolUnit, Step } from "@/lib/workouts/garmin-format";

const dayIn = (tz: string, offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: tz });

/**
 * Each evening: tell every athlete what to pack for tomorrow's workouts, and once per pair when
 * shoes pass the replacement mark. Rules only (no AI). Sent through server_notify, so dedupe keys,
 * test athletes and each person's notification settings apply.
 */
export async function runEvening() {
  const admin = createAdminClient();
  const { data: people } = await admin.from("profiles").select("id, timezone, units, weather_location").eq("is_test", false);
  let packs = 0;
  let shoes = 0;

  for (const p of people ?? []) {
    const tz = p.timezone || "America/Chicago";
    const units = p.units === "km" ? "km" : "mi";
    const tomorrow = dayIn(tz, 1);
    const place = asPlace(p.weather_location);
    const [{ data: workouts }, { data: gearRow }, { data: races }, forecast] = await Promise.all([
      admin
        .from("planned_workouts")
        .select("id, title, sport, description, steps, pool_length, pool_unit")
        .eq("athlete_id", p.id)
        .eq("scheduled_date", tomorrow)
        .is("deleted_at", null)
        .neq("status", "draft"),
      admin.from("athlete_gear").select("gear").eq("athlete_id", p.id).maybeSingle(),
      admin.from("races").select("id, name, sport").eq("athlete_id", p.id).eq("race_date", tomorrow),
      place ? getForecast(place, tz) : Promise.resolve(null),
    ]);
    const weather = forecast?.find((d) => d.date === tomorrow) ?? null;
    const list = (items: PackItem[]) => `Pack: ${items.slice(0, 6).map((i) => i.item).join(", ")}${items.length > 6 ? "…" : ""}`;
    const closet = cleanCloset(gearRow?.gear);
    const mileage = closet.shoes.length ? await getShoeMileage(admin, p.id, closet, tz) : {};

    for (const w of workouts ?? []) {
      const pool: Pool = w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit as PoolUnit } : null;
      const lines = describe((w.steps ?? []) as Step[], units, pool, w.sport === "swim");
      const items = [
        ...packFor({ sport: w.sport, title: w.title, description: [w.description, ...lines].filter(Boolean).join(" ") }, closet, mileage),
        ...(weather ? weatherPack(weather, w.sport, units) : []),
      ];
      if (!items.length) continue;
      const body = list(items);
      await admin.rpc("server_notify", { p_user: p.id, p_kind: "workout_pack", p_title: `Tomorrow: ${w.title}`, p_body: body, p_href: `/training/workouts/${w.id}`, p_key: `pack:${w.id}` });
      packs++;
    }

    // Race tomorrow: the race-day bag, with the weather.
    for (const r of races ?? []) {
      const items = raceDayPack(r.sport, closet, mileage, weather, units, r.name);
      await admin.rpc("server_notify", { p_user: p.id, p_kind: "workout_pack", p_title: `Race tomorrow: ${r.name} 🏁`, p_body: `${list(items)}. Early night!`, p_href: `/races/${r.id}`, p_key: `race_eve:${r.id}` });
      packs++;
    }

    // Shoes past the replacement mark: one heads-up per pair, ever.
    for (const s of closet.shoes) {
      if (s.retired || shoeWear(mileage[s.id] ?? 0) !== "replace") continue;
      const key = `shoes:${s.id}:replace`;
      const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", p.id).eq("dedupe_key", key);
      if (count) continue;
      const dist = units === "mi" ? `${Math.round((mileage[s.id] ?? 0) / 1609.344)} miles` : `${Math.round((mileage[s.id] ?? 0) / 1000)} km`;
      await admin.rpc("server_notify", {
        p_user: p.id,
        p_kind: "workout_shoes",
        p_title: `Your ${s.model} are at ${dist}`,
        p_body: "Most running shoes are worn out somewhere between 300 and 500 miles. Time to think about a new pair, and retire these in My closet when you do.",
        p_href: "/account#closet",
        p_key: key,
      });
      shoes++;
    }
  }
  return { packs, shoes };
}

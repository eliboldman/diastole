import { packFor, type Closet, type PackItem } from "./closet.ts";
import { weatherPack, type DayWeather, type Units } from "./weather.ts";

/** The race-day bag: race essentials, the athlete's race gear from My closet, and the weather. */
export function raceDayPack(sport: string, closet: Closet, mileage: Record<string, number>, weather: DayWeather | null, units: Units, name = ""): PackItem[] {
  const tri = sport === "tri";
  const legs = tri ? ["swim", "bike", "run"] : [sport === "other" ? "run" : sport];
  const out: PackItem[] = [
    { item: "Race bib, pins or race belt", why: "And the timing chip if it's separate" },
    { item: "Race-day fuel and gels", why: "Exactly what you practiced" },
    { item: "Photo ID and race confirmation" },
  ];
  for (const leg of legs) {
    // "race" so the carbon pair, TT bike and race gear get picked.
    // Triathlons and time trials ride the TT bike ("race pace" picks it).
    const desc = leg === "bike" && (tri || /\btt\b|time trial|70\.3|ironman|tri/i.test(name)) ? "race pace" : "race";
    for (const i of packFor({ sport: leg, title: `${name} race day`, description: desc }, closet, mileage)) if (!out.some((o) => o.item === i.item)) out.push(i);
  }
  if (tri) out.push({ item: "Wetsuit (if legal), cap, goggles, transition towel", why: "Lay out transition the night before" });
  if (weather) for (const i of weatherPack(weather, legs.includes("bike") ? "bike" : legs[0], units)) if (!out.some((o) => o.item === i.item)) out.push(i);
  out.push({ item: "Warm, throwaway layer for the start", why: "Pre-race waiting gets cold" });
  out.push({ item: "Dry clothes and recovery snack for after" });
  return out;
}

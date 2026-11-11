// Race packing list: grouped by bag and moment, from the race type and distance, race-day weather,
// water temperature (wetsuit rules), how the athlete is getting there, their own gear, fueling
// quantities from the race fuel plan, and the coach's master list. Plus a dated timeline.
// Rules only. Pure module, testable with `node`.

import type { PackItem } from "../closet.ts";
import type { RacePlan } from "../fuel/race.ts";
import type { DayWeather } from "../weather.ts";

export type Bag = "travel" | "night" | "morning" | "swim" | "t1" | "t2" | "special" | "course" | "after";
export const BAGS: { key: Bag; label: string; tri?: boolean }[] = [
  { key: "travel", label: "Travel" },
  { key: "night", label: "Night before" },
  { key: "morning", label: "Race morning" },
  { key: "swim", label: "Swim start", tri: true },
  { key: "t1", label: "T1: swim to bike", tri: true },
  { key: "t2", label: "T2: bike to run", tri: true },
  { key: "special", label: "Special needs", tri: true },
  { key: "course", label: "On course" },
  { key: "after", label: "After the finish" },
];
export type Travel = "local" | "drive" | "fly";
export type Item = { key: string; label: string; bag: Bag; qty?: string; why?: string; source?: "gear" | "weather" | "fuel" | "coach" | "mine" };
export type MasterItem = { label: string; bag: Bag; sports?: string[] }; // coach's list; sports empty = every race
export type PackInput = {
  sport: string; // run | bike | swim | tri | other
  distanceKm: number | null;
  minutes: number | null; // expected race time
  weather: DayWeather | null;
  waterC: number | null;
  travel: Travel;
  gear: { leg: "bike" | "run"; item: PackItem }[]; // from the athlete's closet (race shoes, the TT bike, ...)
  fuel: RacePlan | null;
  master: MasterItem[];
  extra: { label: string; bag: Bag }[]; // the athlete's own additions
  units: "mi" | "km";
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const tempF = (c: number) => Math.round((c * 9) / 5 + 32);
const temp = (c: number, u: "mi" | "km") => (u === "mi" ? `${tempF(c)}°F` : `${Math.round(c)}°C`);

/** USA Triathlon age-group wetsuit rules, plus comfort below 16 °C. */
export function wetsuitCall(waterC: number | null, u: "mi" | "km"): { label: string; why: string; extra: string[] } | null {
  if (waterC === null) return null;
  if (waterC > 28.8) return { label: "Swimskin or tri suit only", why: `Water ${temp(waterC, u)}: no wetsuits above 84°F (28.8°C)`, extra: [] };
  if (waterC > 25.6) return { label: "Swimskin (wetsuit optional but no awards)", why: `Water ${temp(waterC, u)}: over 78°F (25.6°C) a wetsuit means no age-group awards`, extra: [] };
  if (waterC >= 16) return { label: "Wetsuit", why: `Water ${temp(waterC, u)}: wetsuit legal`, extra: ["Anti-chafe for the wetsuit neck"] };
  if (waterC >= 13) return { label: "Wetsuit, neoprene cap, earplugs", why: `Water ${temp(waterC, u)}: cold. Warm up on land, get in early to acclimatize`, extra: ["Anti-chafe for the wetsuit neck"] };
  return { label: "Wetsuit, neoprene cap and booties, earplugs", why: `Water ${temp(waterC, u)}: very cold. Check if the race shortens the swim`, extra: ["Anti-chafe for the wetsuit neck", "Warm drink in a flask for after the swim"] };
}

/** How much fuel to carry from the race fuel plan: gels (25 g), drink mix and salt. */
export function fuelQuantities(plan: RacePlan | null, sport: string): Item[] {
  if (!plan || plan.minutes < 60) return plan ? [{ key: "fuel-water", label: "Water or sports drink", bag: "course", why: "Under an hour: drink to thirst", source: "fuel" }] : [];
  const hours = plan.minutes / 60;
  const carbs = plan.carbsPerHour * hours;
  const gels = Math.ceil(carbs / 25);
  const out: Item[] = [{ key: "fuel-gels", label: "Gels or chews", qty: `${gels} (+2 spare)`, bag: "course", why: `${plan.carbsPerHour} g carbs an hour for about ${Math.round(hours * 10) / 10} h (25 g each)`, source: "fuel" }];
  if (plan.fluidMlPerHour) {
    const litres = (plan.fluidMlPerHour * hours) / 1000;
    out.push({ key: "fuel-fluid", label: sport === "run" ? "Soft flask or plan the aid stations" : "Bottles", qty: `${Math.round(litres * 10) / 10} L over the race`, bag: "course", why: `About ${plan.fluidMlPerHour} ml an hour from your sweat test`, source: "fuel" });
  }
  if (plan.sodiumMgPerHour) out.push({ key: "fuel-salt", label: "Electrolyte tabs or salt caps", qty: `${Math.ceil((plan.sodiumMgPerHour * hours) / 250)} × 250 mg sodium`, bag: "course", source: "fuel" });
  out.push({ key: "fuel-breakfast", label: "Race breakfast you've practised", qty: plan.breakfast.grams ? `${plan.breakfast.grams[0]}–${plan.breakfast.grams[1]} g carbs` : undefined, bag: "morning", why: `${plan.breakfast.hoursBefore} h before the start`, source: "fuel" });
  return out;
}

/** The full list, grouped. Nothing listed twice; coach and athlete additions keep their bag. */
export function packList(inp: PackInput): Item[] {
  const tri = inp.sport === "tri";
  const long = (inp.minutes ?? 0) >= 240 || (inp.distanceKm ?? 0) >= 100;
  const out: Item[] = [];
  const add = (label: string, bag: Bag, extra: Partial<Item> = {}) => {
    const key = extra.key ?? slug(label);
    if (!out.some((o) => o.key === key || o.label.toLowerCase() === label.toLowerCase())) out.push({ key, label, bag, ...extra });
  };
  // Travel
  if (inp.travel !== "local") {
    add("Photo ID, race confirmation, insurance card", "travel");
    add("Phone and watch chargers", "travel");
    add("Bike tools, pump, spare tube or plugs", "travel");
    if (inp.travel === "fly") {
      add("Bike box or case (check airline size and fee)", "travel");
      add("Race kit and shoes in carry-on", "travel", { why: "Bags get lost; you can't race without these" });
      add("Pedals and multitool for the rebuild", "travel");
    }
    add("Familiar food for the day before", "travel", { why: "Nothing new the night before" });
  } else add("Photo ID and race confirmation", "night");
  // Night before
  add("Race bib, pins or race belt", "night", { why: "And the timing chip if it's separate" });
  add("Charge watch, bike computer, lights", "night");
  if (tri || inp.sport === "bike") add("Pump tyres, check brakes and gears", "night");
  add("Alarm set, outfit laid out", "night");
  // Morning
  add("Warm throwaway layer for the start", "morning", { why: "Pre-race waiting gets cold" });
  add("Anti-chafe and sunscreen", "morning");
  add("Toilet paper or wipes", "morning", { why: "Port-a-potty lines" });
  add("Pre-start gel and a bottle", "morning", { why: "About 15 minutes before the gun" });
  // Swim and transitions
  if (tri) {
    const w = wetsuitCall(inp.waterC, inp.units);
    add(w ? w.label : "Wetsuit (if legal), check the water temperature", "swim", { key: "wetsuit", why: w?.why ?? "Races post it the day before" });
    for (const e of w?.extra ?? []) add(e, "swim");
    add("Two pairs of goggles (clear and tinted), race cap", "swim");
    add("Helmet, sunglasses, bike shoes", "t1");
    add("Race number belt", "t2");
    add("Run shoes with elastic laces, cap or visor", "t2");
    add("Small towel to mark your spot", "t1");
    if (long) {
      add("Spare tube, CO2, tyre levers on the bike", "t1");
      add("Special-needs bag: extra fuel, spare socks, anti-chafe", "special");
    }
  } else if (inp.sport === "bike") {
    add("Helmet, sunglasses, bike shoes", "morning");
    add("Spare tube, CO2, tyre levers", "course");
  } else if (inp.sport === "swim") {
    add("Two pairs of goggles, race cap", "morning");
    const w = wetsuitCall(inp.waterC, inp.units);
    if (w) add(w.label, "morning", { key: "wetsuit", why: w.why });
  }
  // The athlete's gear (race shoes, the TT bike, ...)
  for (const g of inp.gear) {
    if (/^find a|treadmill|trainer|spin bike|ride by heart|towel, fan/i.test(g.item.item)) continue; // training-day items
    add(g.item.item, tri ? (g.leg === "run" ? "t2" : "t1") : "morning", { why: g.item.why, source: "gear" });
  }
  // Fuel
  for (const f of fuelQuantities(inp.fuel, inp.sport)) add(f.label, f.bag, f);
  // Weather
  if (inp.weather) {
    const w = inp.weather;
    if (w.feelsMorning >= 25) add("Extra fluids and electrolytes, cap, ice in a sock", "course", { why: `Feels like ${temp(w.feelsMorning, inp.units)}: pace by effort`, source: "weather" });
    if (w.coldMorning <= 8) add("Gloves, arm warmers, a hat you can ditch", "morning", { why: `${temp(w.coldMorning, inp.units)} at the start`, source: "weather" });
    if (w.rainChance >= 50) add("Rain jacket, dry bag for post-race clothes", "morning", { why: `${w.rainChance}% chance of rain`, source: "weather" });
    if (w.wind >= 30 && (tri || inp.sport === "bike")) add("Shallower front wheel if you have one", "night", { why: `Wind ${Math.round(inp.units === "mi" ? w.wind / 1.609 : w.wind)} ${inp.units === "mi" ? "mph" : "km/h"}`, source: "weather" });
  }
  // After
  add("Dry clothes, sandals, warm top", "after");
  add("Recovery snack and drink", "after", { why: "Carbs and protein within the hour" });
  // Coach's master list, then the athlete's own
  for (const m of inp.master) if (!m.sports?.length || m.sports.includes(inp.sport)) add(m.label, tri || !BAGS.find((b) => b.key === m.bag)?.tri ? m.bag : "morning", { source: "coach" });
  for (const e of inp.extra) add(e.label, e.bag, { key: `mine-${slug(e.label)}`, source: "mine" });
  return out.filter((i) => tri || !BAGS.find((b) => b.key === i.bag)?.tri);
}

export type Reminder = { daysOut: number; title: string; body: string };
/** Packing timeline counted back from race day. */
export function timeline(sport: string, travel: Travel): Reminder[] {
  const tri = sport === "tri";
  const out: Reminder[] = [{ daysOut: 7, title: "One week out", body: "Check what's missing: fuel you've practised with, spare goggles, anything worn out. Order it now." }];
  if (tri || sport === "bike") out.push({ daysOut: 5, title: "Bike check", body: "Service, new tyres or tubes if they're worn, test ride after." });
  if (travel === "fly") out.push({ daysOut: 4, title: "Pack the bike", body: "Box it, photo the setup (saddle height!), pack tools and pedals with it." });
  out.push({ daysOut: 3, title: "Lay it all out", body: "Everything on the floor, tick it off the list. Find what's missing while there's time." });
  out.push({ daysOut: 2, title: "Pack the bags", body: tri ? "Swim, T1, T2 and special-needs bags. Label them." : "Race bag packed and by the door." });
  out.push({ daysOut: 1, title: "Final checks", body: tri ? "Bike and bag check-in, walk transition in and out, charge everything." : "Pin your bib, charge the watch, lay out the outfit." });
  return out;
}

/** Clean the athlete's saved packing state. */
export function cleanPackState(raw: unknown): { checked: Record<string, boolean>; extra: { label: string; bag: Bag }[]; travel: Travel; waterC: number | null } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const checked: Record<string, boolean> = {};
  if (r.checked && typeof r.checked === "object") for (const [k, v] of Object.entries(r.checked as Record<string, unknown>).slice(0, 200)) if (v === true && k.length <= 80) checked[k] = true;
  const extra = (Array.isArray(r.extra) ? r.extra : [])
    .slice(0, 40)
    .map((e) => ({ label: String((e as { label?: unknown })?.label ?? "").trim().slice(0, 80), bag: ((e as { bag?: unknown })?.bag ?? "morning") as Bag }))
    .filter((e) => e.label && BAGS.some((b) => b.key === e.bag));
  const travel: Travel = r.travel === "drive" || r.travel === "fly" ? r.travel : "local";
  const w = Number(r.waterC);
  return { checked, extra, travel, waterC: r.waterC !== null && r.waterC !== undefined && Number.isFinite(w) && w >= 0 && w <= 35 ? Math.round(w * 10) / 10 : null };
}

export function cleanMaster(raw: unknown): MasterItem[] {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, 60)
    .map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      return { label: String(o.label ?? "").trim().slice(0, 80), bag: (o.bag ?? "morning") as Bag, sports: (Array.isArray(o.sports) ? o.sports : []).filter((s): s is string => ["run", "bike", "swim", "tri", "other"].includes(String(s))) };
    })
    .filter((m) => m.label && BAGS.some((b) => b.key === m.bag));
}

// Weather for workouts and race day, from Open-Meteo (free, no key). Rules only: heat, cold, rain,
// wind, snow and storms turn into a short summary and pack-list items. Forecasts reach 16 days out.

import type { PackItem } from "@/lib/closet";

export type Place = { name: string; lat: number; lon: number };
/** The training window (6-10 am local, when most sessions happen) plus the day's range. */
export type DayWeather = {
  date: string;
  high: number; // °C
  low: number;
  rainChance: number; // % (the most likely hour in the window)
  feelsMorning: number; // °C, warmest "feels like" in the window
  coldMorning: number; // °C, coldest "feels like" in the window
  wind: number; // km/h, strongest in the window
  code: number; // WMO weather code, the worst in the window
};

export const FORECAST_DAYS = 16;

export function asPlace(raw: unknown): Place | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { name: typeof r.name === "string" ? r.name.slice(0, 80) : "Your area", lat, lon };
}

// ---------------------------------------------------------------- fetching

type Hourly = { time: string[]; apparent_temperature: number[]; precipitation_probability: (number | null)[]; wind_speed_10m: number[]; weather_code: number[] };
type Daily = { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[] };

/** One day's weather at a place, or null when it's out of range or the service is down. */
export async function getDayWeather(place: Place, date: string, timeZone: string): Promise<DayWeather | null> {
  const days = await getForecast(place, timeZone);
  return days?.find((d) => d.date === date) ?? null;
}

export async function getForecast(place: Place, timeZone: string): Promise<DayWeather[] | null> {
  const q = new URLSearchParams({
    latitude: place.lat.toFixed(3),
    longitude: place.lon.toFixed(3),
    hourly: "apparent_temperature,precipitation_probability,wind_speed_10m,weather_code",
    daily: "temperature_2m_max,temperature_2m_min",
    timezone: timeZone,
    forecast_days: String(FORECAST_DAYS),
  });
  try {
    // Shared by everyone at the same spot; forecasts don't change minute to minute.
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { hourly?: Hourly; daily?: Daily };
    return j.hourly && j.daily ? toDays(j.hourly, j.daily) : null;
  } catch {
    return null;
  }
}

export function toDays(h: Hourly, d: Daily): DayWeather[] {
  return d.time.map((date, i) => {
    const idx = h.time.flatMap((t, k) => (t.startsWith(date) && +t.slice(11, 13) >= 6 && +t.slice(11, 13) <= 10 ? [k] : []));
    const pick = <T,>(arr: T[]) => idx.map((k) => arr[k]).filter((v): v is NonNullable<T> => v !== null && v !== undefined);
    const feels = pick(h.apparent_temperature);
    return {
      date,
      high: d.temperature_2m_max[i],
      low: d.temperature_2m_min[i],
      rainChance: Math.max(0, ...pick(h.precipitation_probability)),
      feelsMorning: feels.length ? Math.max(...feels) : d.temperature_2m_max[i],
      coldMorning: feels.length ? Math.min(...feels) : d.temperature_2m_min[i],
      wind: Math.max(0, ...pick(h.wind_speed_10m)),
      code: Math.max(0, ...pick(h.weather_code)),
    };
  });
}

/** Town search for the settings field. */
export async function searchPlaces(name: string): Promise<Place[]> {
  if (name.trim().length < 2) return [];
  const q = new URLSearchParams({ name: name.trim().slice(0, 60), count: "6", language: "en", format: "json" });
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: { name: string; admin1?: string; country_code?: string; country?: string; latitude: number; longitude: number }[] };
    return (j.results ?? []).map((p) => ({
      name: [p.name, p.admin1, p.country_code === "US" ? null : p.country].filter(Boolean).join(", "),
      lat: Math.round(p.latitude * 100) / 100, // about 1 km: a town, not a house
      lon: Math.round(p.longitude * 100) / 100,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- rules

const SNOW = new Set([71, 73, 75, 77, 85, 86]);
const ICE = new Set([56, 57, 66, 67]);
const STORM = new Set([95, 96, 99]);

export type Units = "mi" | "km";
export const temp = (c: number, u: Units) => (u === "mi" ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`);
export const speed = (kmh: number, u: Units) => (u === "mi" ? `${Math.round(kmh / 1.609)} mph` : `${Math.round(kmh)} km/h`);

export function describeSky(code: number) {
  if (STORM.has(code)) return "Thunderstorms";
  if (SNOW.has(code)) return "Snow";
  if (ICE.has(code)) return "Freezing rain";
  if (code >= 61 && code <= 65) return "Rain";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code === 45 || code === 48) return "Fog";
  if (code === 3) return "Cloudy";
  if (code === 1 || code === 2) return "Partly cloudy";
  return "Clear";
}

/** "68–88°F, clear. Feels like 84°F by 10 am, 20% rain." */
export function weatherLine(w: DayWeather, u: Units) {
  const range = u === "mi" ? `${temp(w.low, u).replace("°F", "")}–${temp(w.high, u)}` : `${temp(w.low, u).replace("°C", "")}–${temp(w.high, u)}`;
  const bits = [`${range}, ${describeSky(w.code).toLowerCase()}`];
  bits.push(`Mornings feel like ${temp(w.coldMorning, u)}${Math.abs(w.feelsMorning - w.coldMorning) >= 3 ? `–${temp(w.feelsMorning, u)}` : ""}`);
  if (w.rainChance >= 20) bits.push(`${w.rainChance}% chance of rain`);
  if (w.wind >= 25) bits.push(`wind ${speed(w.wind, u)}`);
  return `${bits.join(". ")}.`;
}

export type Sport = "run" | "bike" | "swim" | string;

/** What the weather adds to the pack list for this kind of session (morning window). */
export function weatherPack(w: DayWeather, sport: Sport, u: Units): PackItem[] {
  const out: PackItem[] = [];
  const bike = /cycl|bik|ride|spin/i.test(sport);
  const run = /run/i.test(sport);
  const swim = /swim/i.test(sport);
  if (swim) {
    if (STORM.has(w.code)) out.push({ item: "Check for lightning before any open-water swim", why: "Thunderstorms in the forecast" });
    return out;
  }
  if (STORM.has(w.code)) out.push({ item: "Plan B indoors", why: "Thunderstorms in the forecast. Treadmill or trainer if it's overhead" });
  else if (SNOW.has(w.code) || ICE.has(w.code)) out.push({ item: run ? "Treadmill, or trail shoes with grip" : "Indoor trainer", why: `${describeSky(w.code)} in the forecast` });
  if (w.feelsMorning >= 27) out.push({ item: "Extra fluids and electrolytes", why: `Feels like ${temp(w.feelsMorning, u)} by mid-morning. Go early and pace by heart rate` });
  else if (w.feelsMorning >= 22) out.push({ item: "A bottle and electrolytes", why: `Warm: ${temp(w.feelsMorning, u)}` });
  if (w.coldMorning <= -5) out.push({ item: "Thermal layers, hat, gloves, cover your skin", why: `Feels like ${temp(w.coldMorning, u)}` });
  else if (w.coldMorning <= 4) out.push({ item: "Layers, gloves and a hat", why: `Feels like ${temp(w.coldMorning, u)}` });
  else if (bike && w.coldMorning <= 12) out.push({ item: "Arm warmers, vest or a light jacket", why: `${temp(w.coldMorning, u)} at the start; it's colder at speed` });
  if (w.rainChance >= 50 && !STORM.has(w.code)) out.push({ item: bike ? "Rain jacket, and lights" : "Rain jacket or a cap", why: `${w.rainChance}% chance of rain` });
  if (bike && w.wind >= 30) out.push({ item: "Consider a sheltered route or the trainer", why: `Wind ${speed(w.wind, u)}` });
  return out;
}

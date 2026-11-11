// Display helpers for courses in the viewer's units.
export type U = "mi" | "km";
const MI = 1609.344;
export const dist = (m: number, u: U, digits = 1) => `${Math.round((u === "mi" ? m / MI : m / 1000) * 10 ** digits) / 10 ** digits} ${u}`;
export const distNum = (m: number, u: U) => Math.round((u === "mi" ? m / MI : m / 1000) * 10) / 10;
export const ele = (m: number, u: U) => (u === "mi" ? `${Math.round(m * 3.28084)} ft` : `${Math.round(m)} m`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
/** Pace from seconds per km into the viewer's unit. */
export const pace = (secPerKm: number, u: U) => `${mmss(u === "mi" ? secPerKm * (MI / 1000) : secPerKm)}/${u}`;
export const paceNum = (secPerKm: number, u: U) => mmss(u === "mi" ? secPerKm * (MI / 1000) : secPerKm);
/** "7:30" in the viewer's unit back to seconds per km. */
export function parsePace(text: string, u: U): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m || Number(m[2]) >= 60) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  return Math.round(u === "mi" ? s / (MI / 1000) : s);
}

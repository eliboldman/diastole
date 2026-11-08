// Typing a pace on a phone: the number pad has no colon, so "635", "6.35", "6,35", "6 35" and
// "6:35" all mean 6 minutes 35 seconds. Pure, for tests.

/** Seconds per unit from what was typed, or null if it can't be a pace. */
export function parsePace(text: string): number | null {
  const t = text.trim().replace(/[′']/g, ":").replace(/["″]|\s*(min|\/\s*(mi|km|mile)).*$/gi, "");
  let m = /^(\d{1,2})\s*[:.,\s]\s*(\d{1,2})$/.exec(t);
  if (m && m[2].length === 1) m = null; // "6:5" is ambiguous; ask for two digits
  if (!m) {
    const digits = /^\d{3,4}$/.exec(t);
    if (digits) m = [t, t.slice(0, -2), t.slice(-2)] as unknown as RegExpExecArray;
  }
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  if (sec > 59 || min > 30) return null;
  const total = min * 60 + sec;
  return total > 0 ? total : null;
}

/** As-you-type formatting for the pace field: digits only, colon before the last two ("635" → "6:35"). */
export function formatPaceTyping(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, -2)}:${d.slice(-2)}`;
}

/** A whole number from what was typed: "250", "250w", "172 bpm". */
export function wholeNumber(text: string): number | null {
  const m = /^\s*(\d{2,3})\s*[a-z]*\s*$/i.exec(text);
  return m ? Number(m[1]) : null;
}

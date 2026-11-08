// Secrets this person has found on this device (until Phase E keeps them on the account).
// Browser storage can be missing (private mode, cleared data), so every access is guarded.
const KEY = "d_secrets";

export function hasSecret(id: string): boolean {
  try {
    // Found on the account (the egg cookie) or on this device.
    const cookie = document.cookie.split("; ").find((c) => c.startsWith("d_eggs="))?.slice(7);
    if (cookie && (JSON.parse(decodeURIComponent(cookie))?.found ?? []).includes(id)) return true;
    return (JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]).includes(id);
  } catch {
    return false;
  }
}

export function addSecret(id: string) {
  try {
    const list = new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
    list.add(id);
    localStorage.setItem(KEY, JSON.stringify([...list]));
  } catch {
    /* storage unavailable */
  }
}

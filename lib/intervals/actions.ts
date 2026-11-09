"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, requireUser } from "@/lib/supabase/server";

import { connect, disconnect, IntervalsError, pullRides, syncAthlete } from "./sync";

export type ConnectState = { ok: true; message: string } | { ok: false; error: string } | null;

export async function connectIntervals(_prev: ConnectState, form: FormData): Promise<ConnectState> {
  const me = await requireUser();
  const key = String(form.get("api_key") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(key)) return { ok: false, error: "That doesn't look like an intervals.icu API key. Copy it from intervals.icu › Settings › Developer Settings." };
  try {
    const r = await connect(me.id, key);
    revalidatePath("/me/intervals");
    const parts = [`Connected to ${r.who.name ?? r.who.id}.`];
    if (r.sync.status === "synced") parts.push(`${r.sync.created ?? 0} upcoming bike workout${r.sync.created === 1 ? "" : "s"} sent.`);
    if (r.sync.status === "error") parts.push(`Workouts didn't send yet: ${r.sync.error}`);
    if (r.pull.status === "done" && r.pull.added) parts.push(`${r.pull.added} ride${r.pull.added === 1 ? "" : "s"} brought in.`);
    return { ok: true, message: parts.join(" ") };
  } catch (e) {
    if (e instanceof IntervalsError && (e.status === 401 || e.status === 403)) return { ok: false, error: "intervals.icu didn't accept that key. Copy it again from Developer Settings." };
    return { ok: false, error: "Couldn't reach intervals.icu. Try again in a minute." };
  }
}

export async function disconnectIntervals(form: FormData) {
  const me = await requireUser();
  await disconnect(me.id, form.get("keep") !== "1");
  revalidatePath("/me/intervals");
}

export async function setSyncFtp(form: FormData) {
  const me = await requireUser();
  const on = form.get("on") === "1";
  const admin = createAdminClient();
  await admin.from("intervals_connections").update({ sync_ftp: on, ...(on ? { dirty_at: new Date().toISOString() } : {}) }).eq("athlete_id", me.id);
  if (on) await syncAthlete(me.id, {}, admin);
  revalidatePath("/me/intervals");
}

export async function syncIntervalsNow() {
  const me = await requireUser();
  await syncAthlete(me.id, { force: true });
  await pullRides(me.id);
  revalidatePath("/me/intervals");
}

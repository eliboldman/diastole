"use server";

import { revalidatePath } from "next/cache";

import { deliver } from "@/app/(coach)/athlete/[id]/workouts/actions";
import { resendWorkoutToGarmin } from "@/lib/garmin/training";
import { createClient, requireCoach } from "@/lib/supabase/server";
import { validateSteps, type Brick, type Pool, type Sport, type Step } from "@/lib/workouts/garmin-format";
import { annotate, stripRel, ZONE_COLUMNS, type RelZones } from "@/lib/workouts/relative";
import { validateStrength, type StrengthItem } from "@/lib/strength/workout";
import { retireWorkout } from "@/lib/workouts/retire";

import { addDays, toTemplate, updatesFor, type AppliedRow, type Change } from "./template";
import { draftRow, planFor, poolOf } from "./plan-for";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type Supa = Awaited<ReturnType<typeof createClient>>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const cleanTags = (tags: unknown) =>
  [...new Set((Array.isArray(tags) ? tags : []).map((t) => String(t).toLowerCase().replace(/[^a-z0-9.+ -]/g, "").trim().slice(0, 24)).filter(Boolean))].slice(0, 12);


async function bump(supabase: Supa, templateId: string) {
  const { data } = await supabase.from("plan_templates").select("version").eq("id", templateId).maybeSingle();
  await supabase.from("plan_templates").update({ version: (data?.version ?? 1) + 1, updated_at: new Date().toISOString() }).eq("id", templateId);
  revalidatePath(`/library/plans/${templateId}`);
  revalidatePath("/library");
}

// ---------------------------------------------------------------- create

/** Save an athlete's block (their workouts between two dates) as a plan template. */
export async function saveAsTemplate(input: { athleteId: string; from: string; to: string; name: string; tags?: string[]; description?: string }): Promise<Result<{ id: string }>> {
  const coach = await requireCoach();
  if (!UUID.test(input.athleteId) || !DATE.test(input.from) || !DATE.test(input.to) || input.to < input.from) return { ok: false, error: "Pick a start and end date." };
  const name = input.name.trim().slice(0, 120);
  if (!name) return { ok: false, error: "Give the plan a name." };
  const supabase = await createClient();
  const [{ data: rows }, { data: zones }] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select("scheduled_date, title, sport, description, why, steps, brick, pool_length, pool_unit, strength")
      .eq("athlete_id", input.athleteId)
      .is("deleted_at", null)
      .gte("scheduled_date", input.from)
      .lte("scheduled_date", input.to),
    supabase.from("athlete_zones").select(ZONE_COLUMNS).eq("athlete_id", input.athleteId).maybeSingle(),
  ]);
  if (!rows?.length) return { ok: false, error: "No workouts in those dates." };
  const z = (zones ?? {}) as RelZones;
  const t = toTemplate(
    rows.map((r) => ({ ...r, steps: (r.steps ?? []) as Step[], brick: (r.brick ?? null) as Brick, pool: poolOf(r.pool_length, r.pool_unit) })),
    input.from,
  );
  const { data: created, error } = await supabase
    .from("plan_templates")
    .insert({ coach_id: coach.id, name, description: input.description?.trim().slice(0, 2000) || null, tags: cleanTags(input.tags), weeks: Math.min(52, t.weeks), ref_zones: z ?? {} })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Couldn't save the plan." };
  const { error: wErr } = await supabase.from("plan_template_workouts").insert(
    t.workouts
      .filter((w) => w.week <= 52)
      .map((w) => ({
        template_id: created.id,
        week: w.week,
        day: w.day,
        position: w.position,
        title: w.title,
        sport: w.sport,
        description: w.description,
        why: w.why,
        // Percentages of the source athlete's zones, so the plan scales to anyone.
        steps: annotate(stripRel(w.steps), z, w.pool),
        brick: w.brick?.steps?.length ? { sport: "run", steps: annotate(stripRel(w.brick.steps), z) } : null,
        strength: w.sport === "strength" ? (w.strength ?? []) : null,
        pool_length: w.pool?.length ?? null,
        pool_unit: w.pool?.unit ?? null,
      })),
  );
  if (wErr) {
    await supabase.from("plan_templates").delete().eq("id", created.id);
    return { ok: false, error: wErr.message };
  }
  revalidatePath("/library");
  return { ok: true, id: created.id };
}

// ---------------------------------------------------------------- edit

export async function updateTemplate(id: string, patch: { name?: string; description?: string | null; tags?: string[]; weekNotes?: Record<string, string>; raceWeek?: boolean }): Promise<Result> {
  await requireCoach();
  if (!UUID.test(id)) return { ok: false, error: "Unknown plan." };
  const supabase = await createClient();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim().slice(0, 120);
    if (!n) return { ok: false, error: "The plan needs a name." };
    row.name = n;
  }
  if (patch.description !== undefined) row.description = patch.description?.trim().slice(0, 2000) || null;
  if (patch.tags !== undefined) row.tags = cleanTags(patch.tags);
  if (patch.raceWeek !== undefined) row.race_week = Boolean(patch.raceWeek);
  if (patch.weekNotes !== undefined)
    row.week_notes = Object.fromEntries(Object.entries(patch.weekNotes).filter(([k, v]) => /^\d{1,2}$/.test(k) && typeof v === "string" && v.trim()).map(([k, v]) => [k, v.trim().slice(0, 300)]));
  const { error } = await supabase.from("plan_templates").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  // Names, tags and notes don't change workouts, so they don't count as an update to push.
  revalidatePath(`/library/plans/${id}`);
  revalidatePath("/library");
  return { ok: true };
}

export async function moveTemplateWorkout(id: string, week: number, day: number): Promise<Result> {
  await requireCoach();
  if (!UUID.test(id) || !(week >= 1 && week <= 52) || !(day >= 0 && day <= 6)) return { ok: false, error: "Pick a week and day." };
  const supabase = await createClient();
  const { data: tw } = await supabase.from("plan_template_workouts").select("template_id").eq("id", id).maybeSingle();
  if (!tw) return { ok: false, error: "Not found." };
  const { data: t } = await supabase.from("plan_templates").select("weeks").eq("id", tw.template_id).maybeSingle();
  const { error } = await supabase.from("plan_template_workouts").update({ week, day, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (t && week > t.weeks) await supabase.from("plan_templates").update({ weeks: week }).eq("id", tw.template_id);
  await bump(supabase, tw.template_id);
  return { ok: true };
}

export async function deleteTemplateWorkout(id: string): Promise<Result> {
  await requireCoach();
  if (!UUID.test(id)) return { ok: false, error: "Unknown session." };
  const supabase = await createClient();
  const { data: tw } = await supabase.from("plan_template_workouts").select("template_id").eq("id", id).maybeSingle();
  if (!tw) return { ok: false, error: "Not found." };
  const { error } = await supabase.from("plan_template_workouts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await bump(supabase, tw.template_id);
  return { ok: true };
}

/** The builder's save in template mode: one session's content (week/day are moved separately). */
export async function saveTemplateWorkout(input: {
  templateId: string;
  id?: string;
  week: number;
  day: number;
  title: string;
  sport: Sport | "strength";
  strength?: StrengthItem[] | null;
  description: string;
  why?: string;
  steps: Step[];
  pool?: Pool;
  brick?: Brick;
}): Promise<Result<{ id: string }>> {
  await requireCoach();
  if (!UUID.test(input.templateId)) return { ok: false, error: "Unknown plan." };
  if (!input.title.trim()) return { ok: false, error: "Give the workout a title." };
  const pool = input.sport === "swim" ? (input.pool ?? null) : null;
  const errors = input.sport === "strength" ? validateStrength(input.strength ?? []) : validateSteps(input.steps, 0, input.sport, pool);
  if (input.sport === "bike" && input.brick?.steps?.length) errors.push(...validateSteps(input.brick.steps, 0, "run", null).map((e) => `Run off the bike: ${e}`));
  if (errors.length) return { ok: false, error: [...new Set(errors)].join(" ") };
  const supabase = await createClient();
  const { data: t } = await supabase.from("plan_templates").select("ref_zones, weeks").eq("id", input.templateId).maybeSingle();
  if (!t) return { ok: false, error: "Plan not found." };
  const z = (t.ref_zones ?? {}) as RelZones;
  const row = {
    template_id: input.templateId,
    week: Math.min(52, Math.max(1, Math.round(input.week))),
    day: Math.min(6, Math.max(0, Math.round(input.day))),
    title: input.title.trim().slice(0, 100),
    sport: input.sport,
    description: input.description.trim() || null,
    why: input.why?.replace(/\s+/g, " ").trim().slice(0, 400) || null,
    steps: input.sport === "strength" ? [] : annotate(stripRel(input.steps), z, pool),
    strength: input.sport === "strength" ? (input.strength ?? []) : null,
    brick: input.sport === "bike" && input.brick?.steps?.length ? { sport: "run", steps: annotate(stripRel(input.brick.steps), z) } : null,
    pool_length: pool?.length ?? null,
    pool_unit: pool?.unit ?? null,
    updated_at: new Date().toISOString(),
  };
  let id = input.id;
  if (id) {
    const { error } = await supabase.from("plan_template_workouts").update(row).eq("id", id).eq("template_id", input.templateId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase.from("plan_template_workouts").insert(row).select("id").single();
    if (error || !data) return { ok: false, error: error?.message ?? "Couldn't save." };
    id = data.id as string;
  }
  if (row.week > t.weeks) await supabase.from("plan_templates").update({ weeks: row.week }).eq("id", input.templateId);
  await bump(supabase, input.templateId);
  return { ok: true, id: id! };
}

/** Add a Library workout to a week and day of the template. */
export async function addLibraryWorkout(templateId: string, libraryId: string, week: number, day: number): Promise<Result> {
  await requireCoach();
  if (!UUID.test(templateId) || !UUID.test(libraryId)) return { ok: false, error: "Pick a workout." };
  const supabase = await createClient();
  const [{ data: item }, { data: t }] = await Promise.all([
    supabase.from("workout_library").select("title, sport, description, steps, brick, pool_length, pool_unit, strength").eq("id", libraryId).maybeSingle(),
    supabase.from("plan_templates").select("weeks").eq("id", templateId).maybeSingle(),
  ]);
  if (!item || !t) return { ok: false, error: "Not found." };
  if (!["run", "bike", "swim", "strength"].includes(item.sport)) return { ok: false, error: "Only run, bike, swim and strength workouts go in plans." };
  const { error } = await supabase.from("plan_template_workouts").insert({
    template_id: templateId,
    week,
    day,
    position: 9,
    title: item.title,
    sport: item.sport,
    description: item.description,
    steps: item.steps ?? [], // library steps carry their own percentages when they have them
    brick: item.brick ?? null,
    strength: item.strength ?? null,
    pool_length: item.pool_length,
    pool_unit: item.pool_unit,
  });
  if (error) return { ok: false, error: error.message };
  if (week > t.weeks) await supabase.from("plan_templates").update({ weeks: week }).eq("id", templateId);
  await bump(supabase, templateId);
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<Result> {
  await requireCoach();
  if (!UUID.test(id)) return { ok: false, error: "Unknown plan." };
  const supabase = await createClient();
  // Applied plans keep their workouts; they just lose the link back to the template.
  const { error } = await supabase.from("plan_templates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/library");
  return { ok: true };
}

// ---------------------------------------------------------------- apply

export type PreviewItem = { title: string; sport: string; date: string; week: number; movedFrom: string | null; missing: string[]; past: boolean };
export type Preview = { athleteId: string; name: string; start: string; end: string; items: PreviewItem[]; missing: string[]; moved: number; past: number };


const toPreview = (athleteId: string, p: NonNullable<Awaited<ReturnType<typeof planFor>>>): Preview => ({
  athleteId,
  name: p.name,
  start: p.start,
  end: addDays(p.start, p.t.weeks * 7 - 1),
  items: p.items.map((i) => ({ title: i.tw.title, sport: i.tw.sport, date: i.date, week: i.tw.week, movedFrom: i.movedFrom, missing: i.missing, past: i.past })),
  missing: [...new Set(p.items.flatMap((i) => i.missing))],
  moved: p.items.filter((i) => i.movedFrom && !i.past).length,
  past: p.items.filter((i) => i.past).length,
});

/** What applying would create for each athlete (nothing is saved). */
export async function previewApply(templateId: string, athleteIds: string[], dates: { raceDate?: string | null; startDate?: string | null }): Promise<Result<{ previews: Preview[] }>> {
  await requireCoach();
  if (!UUID.test(templateId) || !athleteIds.length || athleteIds.some((a) => !UUID.test(a))) return { ok: false, error: "Pick at least one athlete." };
  if (!(dates.raceDate && DATE.test(dates.raceDate)) && !(dates.startDate && DATE.test(dates.startDate))) return { ok: false, error: "Pick a race date or a start date." };
  const supabase = await createClient();
  const previews: Preview[] = [];
  for (const a of athleteIds.slice(0, 30)) {
    const p = await planFor(supabase, templateId, a, dates);
    if (p) previews.push(toPreview(a, p));
  }
  return previews.length ? { ok: true, previews } : { ok: false, error: "Couldn't load that plan or those athletes." };
}

/** Create the plan as drafts for each athlete; optionally approve and send the first two weeks. */
export async function applyTemplate(
  templateId: string,
  athleteIds: string[],
  dates: { raceDate?: string | null; startDate?: string | null },
  opts: { sendFirstWeeks?: boolean } = {},
): Promise<Result<{ message: string }>> {
  const coach = await requireCoach();
  const check = await previewApply(templateId, athleteIds, dates);
  if (!check.ok) return check;
  const supabase = await createClient();
  const notes: string[] = [];
  let created = 0;
  let sent = 0;
  for (const a of athleteIds.slice(0, 30)) {
    const p = await planFor(supabase, templateId, a, dates);
    if (!p) continue;
    const { data: app, error } = await supabase
      .from("plan_applications")
      .insert({ template_id: templateId, template_version: p.t.version, coach_id: coach.id, athlete_id: a, start_date: p.start, race_date: dates.raceDate ?? null })
      .select("id")
      .single();
    if (error || !app) {
      notes.push(`${p.name}: ${error?.message ?? "couldn't save"}`);
      continue;
    }
    const rows = p.items.filter((i) => !i.past).map((i) => draftRow(i, a, coach.id, app.id as string));
    if (!rows.length) continue;
    const { data: inserted, error: wErr } = await supabase.from("planned_workouts").insert(rows).select("id, scheduled_date");
    if (wErr) {
      notes.push(`${p.name}: ${wErr.message}`);
      continue;
    }
    created += inserted?.length ?? 0;
    if (opts.sendFirstWeeks) {
      const until = addDays(p.today, 13);
      for (const w of (inserted ?? []).filter((x) => x.scheduled_date <= until)) {
        const { error: aErr } = await supabase.from("planned_workouts").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", w.id).eq("status", "draft");
        if (aErr) continue;
        const r = await deliver(w.id as string, a);
        if (r.ok) sent++;
      }
    }
    if (p.items.some((i) => i.missing.length && !i.past)) notes.push(`${p.name}: kept written targets where they have no ${[...new Set(p.items.flatMap((i) => i.missing))].join(" or ")}`);
    revalidatePath(`/athlete/${a}`);
  }
  revalidatePath(`/library/plans/${templateId}`);
  return {
    ok: true,
    message: `Created ${created} draft${created === 1 ? "" : "s"}${sent ? `, sent the next two weeks (${sent})` : ""}.${notes.length ? ` ${notes.join(". ")}.` : ""}`,
  };
}


// ---------------------------------------------------------------- template updates

export type UpdateView = { kind: Change["kind"]; title: string; date: string; what?: string[]; onWatch?: boolean };

async function changesFor(supabase: Supa, applicationId: string) {
  const { data: app } = await supabase.from("plan_applications").select("id, template_id, template_version, athlete_id, start_date, race_date").eq("id", applicationId).maybeSingle();
  if (!app) return null;
  const p = await planFor(supabase, app.template_id, app.athlete_id, { startDate: app.start_date });
  if (!p) return null;
  const { data: rows } = await supabase
    .from("planned_workouts")
    .select("id, template_workout_id, scheduled_date, title, description, steps, brick, strength, status, external_id, activities(id)")
    .eq("plan_application_id", applicationId)
    .is("deleted_at", null);
  const applied: (AppliedRow & { external_id: string | null })[] = (rows ?? []).map((r) => ({
    id: r.id,
    template_workout_id: r.template_workout_id,
    scheduled_date: r.scheduled_date,
    title: r.title,
    description: r.description,
    steps: (r.steps ?? []) as Step[],
    brick: (r.brick ?? null) as Brick,
    strength: (r.strength ?? null) as StrengthItem[] | null,
    status: r.status,
    external_id: r.external_id,
    done: Array.isArray(r.activities) ? r.activities.length > 0 : Boolean(r.activities),
  }));
  return { app, p, changes: updatesFor({ rows: applied, items: p.items, today: p.today }) };
}

export async function previewUpdate(applicationId: string): Promise<Result<{ changes: UpdateView[] }>> {
  await requireCoach();
  if (!UUID.test(applicationId)) return { ok: false, error: "Unknown plan." };
  const supabase = await createClient();
  const c = await changesFor(supabase, applicationId);
  if (!c) return { ok: false, error: "Couldn't load that plan." };
  return {
    ok: true,
    changes: c.changes.map((ch) =>
      ch.kind === "remove"
        ? { kind: ch.kind, title: ch.row.title, date: ch.row.scheduled_date, onWatch: ch.row.status === "sent" }
        : ch.kind === "update"
          ? { kind: ch.kind, title: ch.item.tw.title, date: ch.row.scheduled_date, what: ch.what, onWatch: ch.row.status === "sent" }
          : { kind: ch.kind, title: ch.item.tw.title, date: ch.item.date },
    ),
  };
}

/** The coach's approval: apply the template's changes to this athlete's upcoming sessions. */
export async function applyUpdate(applicationId: string): Promise<Result<{ message: string }>> {
  const coach = await requireCoach();
  if (!UUID.test(applicationId)) return { ok: false, error: "Unknown plan." };
  const supabase = await createClient();
  const c = await changesFor(supabase, applicationId);
  if (!c) return { ok: false, error: "Couldn't load that plan." };
  let updated = 0;
  let added = 0;
  let removed = 0;
  const problems: string[] = [];
  for (const ch of c.changes) {
    if (ch.kind === "update") {
      const { data: row } = await supabase
        .from("planned_workouts")
        .update({ title: ch.item.tw.title, description: ch.item.tw.description, steps: ch.item.steps, brick: ch.item.tw.sport === "bike" ? ch.item.brick : null, strength: ch.item.tw.sport === "strength" ? (ch.item.tw.strength ?? []) : null })
        .eq("id", ch.row.id)
        .select("status, external_id")
        .maybeSingle();
      if (row?.status === "sent" && row.external_id && !String(row.external_id).startsWith("apple:")) {
        try {
          await resendWorkoutToGarmin(ch.row.id);
        } catch (e) {
          problems.push(`${ch.item.tw.title}: ${(e as Error).message}`);
        }
      }
      // Apple Watch picks up the change on the next app sync (the workout's contents changed).
      updated++;
    } else if (ch.kind === "add") {
      const { error } = await supabase.from("planned_workouts").insert(draftRow(ch.item, c.app.athlete_id, coach.id, applicationId));
      if (!error) added++;
    } else {
      const r = await retireWorkout(supabase, ch.row.id);
      if (r.ok) removed++;
      else problems.push(`${ch.row.title}: ${r.error}`);
    }
  }
  const { data: t } = await supabase.from("plan_templates").select("version").eq("id", c.app.template_id).maybeSingle();
  await supabase.from("plan_applications").update({ template_version: t?.version ?? c.app.template_version }).eq("id", applicationId);
  revalidatePath(`/athlete/${c.app.athlete_id}`);
  revalidatePath(`/library/plans/${c.app.template_id}`);
  const parts = [updated && `${updated} updated`, added && `${added} added as drafts`, removed && `${removed} removed`].filter(Boolean);
  return { ok: true, message: `${parts.length ? parts.join(", ") : "Nothing to change"}.${problems.length ? ` Problems: ${problems.join("; ")}` : ""}` };
}

/** Mark an application as up to date without changing anything (the coach chose to skip). */
export async function skipUpdate(applicationId: string): Promise<Result> {
  await requireCoach();
  if (!UUID.test(applicationId)) return { ok: false, error: "Unknown plan." };
  const supabase = await createClient();
  const { data: app } = await supabase.from("plan_applications").select("template_id").eq("id", applicationId).maybeSingle();
  if (!app) return { ok: false, error: "Not found." };
  const { data: t } = await supabase.from("plan_templates").select("version").eq("id", app.template_id).maybeSingle();
  await supabase.from("plan_applications").update({ template_version: t?.version ?? 1 }).eq("id", applicationId);
  revalidatePath(`/library/plans/${app.template_id}`);
  return { ok: true };
}

/** Add the starter strength plans to this coach's plans (skips any already added by name). */
export async function addStrengthStarters(): Promise<Result<{ added: number }>> {
  const coach = await requireCoach();
  const supabase = await createClient();
  const { STARTERS } = await import("@/lib/strength/starters");
  const { data: have } = await supabase.from("plan_templates").select("name").eq("coach_id", coach.id);
  const names = new Set((have ?? []).map((h) => h.name as string));
  let added = 0;
  for (const s of STARTERS) {
    if (names.has(s.name)) continue;
    const { data: t, error } = await supabase
      .from("plan_templates")
      .insert({ coach_id: coach.id, name: s.name, description: s.description, tags: s.tags, weeks: s.weeks, race_week: false, week_notes: s.notes, ref_zones: {} })
      .select("id")
      .single();
    if (error || !t) continue;
    const rows = s.schedule.flatMap((sch) => sch.weeks.map((week) => ({ template_id: t.id, week, day: sch.day, position: 0, title: sch.session.title, sport: "strength", steps: [], strength: sch.session.items })));
    await supabase.from("plan_template_workouts").insert(rows);
    added++;
  }
  revalidatePath("/library");
  return { ok: true, added };
}

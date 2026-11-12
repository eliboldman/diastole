// Drafting a pod's weekly episode (server only). The draft stays coach-only until approved.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { costOf, DEFAULT_SETTINGS, monthToDateSpend, type AiModel } from "@/lib/ai/coach";
import { apiErrorText } from "@/lib/ai/api-error";
import { sportLabel } from "@/lib/activity/format";
import { PR_LABEL } from "@/lib/avatar/pr-labels";
import { ALL_STICKERS } from "@/lib/pod-stickers";
import { shapeMember, type MemberFacts } from "@/lib/stories/shape";

// A short creative draft: Sonnet writes a livelier recap than Haiku and costs about a cent.
const STORY_MODEL: AiModel = "claude-sonnet-5-5";
const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

const SYSTEM = `You write a short weekly "episode" for a small training group (a pod) of college endurance athletes, in their coach's voice. The coach reviews and edits it before anyone sees it.

Write a title (under 60 characters, playful, no emoji) and a body of 120-220 words: a fun recap of the pod's week, like a short episode of a show. Mention highlights, comebacks, milestones, funny moments (playful workout names, the sticker they got most), campfire highlights, and the baton's journey, using only what's in the input. Give several people a moment; don't rank people or compare who trained more.

Strict rules:
- Use only facts in the input. Never invent numbers, events or quotes. Quote a campfire highlight only as given, lightly.
- Never mention or hint at health, illness, injury, pain, sleep, HRV, stress, readiness, weight, body shape, food or eating. If someone came back after a quiet stretch, celebrate the return without guessing why.
- No one is shamed: nothing about who did less, missed sessions or got heckled the most in a mocking way.
- Warm, upbeat, a little funny, like a coach who likes these people. Second person plural or names. Plain text paragraphs, no headings or lists.`;

const Output = z.object({ title: z.string(), body: z.string() });

/** Monday of the week before `today` (the week to recap). */
export const recapWeekFor = (today: string) => {
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(today, -dow - 7);
};

/** Everything the episode may use, already filtered by each member's sharing. */
export async function gatherWeek(admin: SupabaseClient, podId: string, week: string) {
  const end = addDays(week, 7);
  const [{ data: pod }, { data: members }] = await Promise.all([
    admin.from("pods").select("name, coach_id").eq("id", podId).maybeSingle(),
    admin.from("pod_members").select("athlete_id, baton, profiles(full_name, pod_share_level)").eq("pod_id", podId).eq("status", "active"),
  ]);
  const ids = (members ?? []).map((m) => m.athlete_id as string);
  if (!pod || !ids.length) return null;
  const [{ data: acts }, { data: before }, { data: prs }, { data: fire }, { data: passes }, { data: props }, { data: entries }, { data: baton }] = await Promise.all([
    admin.from("activities").select("athlete_id, sport, duration_s, name, start_time").in("athlete_id", ids).gte("start_time", `${week}T00:00:00Z`).lt("start_time", `${end}T00:00:00Z`).gte("duration_s", 600),
    admin.from("activities").select("athlete_id, start_time").in("athlete_id", ids).gte("start_time", `${addDays(week, -30)}T00:00:00Z`).lt("start_time", `${week}T00:00:00Z`).order("start_time", { ascending: false }),
    admin.from("achievements").select("athlete_id, key").in("athlete_id", ids).gte("achieved_at", `${week}T00:00:00Z`).lt("achieved_at", `${end}T00:00:00Z`),
    admin.from("campfires").select("id").eq("pod_id", podId).eq("week", addDays(week, 6)).maybeSingle(),
    admin.from("baton_passes").select("from_id, kind").eq("pod_id", podId).eq("kind", "pass").gte("passed_at", `${week}T00:00:00Z`).lt("passed_at", `${end}T00:00:00Z`),
    admin.from("pod_props").select("to_id, sticker, count").eq("pod_id", podId).neq("sticker", "comment").eq("hidden", false).gte("created_at", `${week}T00:00:00Z`).lt("created_at", `${end}T00:00:00Z`),
    admin.from("pod_challenge_entries").select("athlete_id, pod_challenges!inner(title, pod_id, starts_on, ends_on)").eq("pod_challenges.pod_id", podId).lte("pod_challenges.starts_on", addDays(week, 6)).gte("pod_challenges.ends_on", week),
    admin.from("pod_batons").select("handoffs, chain, longest").eq("pod_id", podId).maybeSingle(),
  ]);
  const { data: logs } = fire ? await admin.from("campfire_logs").select("author_id, highlight, is_coach").eq("campfire_id", fire.id) : { data: [] };

  const facts = (members ?? []).map((m): MemberFacts => {
    const id = m.athlete_id as string;
    const p = m.profiles as unknown as { full_name: string | null; pod_share_level: number } | null;
    const mine = (acts ?? []).filter((a) => a.athlete_id === id).sort((a, b) => a.start_time.localeCompare(b.start_time));
    const prev = (before ?? []).find((a) => a.athlete_id === id);
    const gap = mine.length && prev ? Math.floor((Date.parse(mine[0].start_time) - Date.parse(prev.start_time)) / DAY) : null;
    const got = (props ?? []).filter((x) => x.to_id === id);
    const tally = new Map<string, number>();
    for (const x of got) tally.set(x.sticker, (tally.get(x.sticker) ?? 0) + x.count);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      first: (p?.full_name || "Someone").split(" ")[0],
      shareLevel: p?.pod_share_level ?? 0,
      sessions: mine.map((a) => ({ sport: sportLabel(a.sport), minutes: Math.round((a.duration_s ?? 0) / 60), name: a.name })),
      prs: (prs ?? []).filter((x) => x.athlete_id === id).map((x) => PR_LABEL[x.key]).filter(Boolean),
      returnedAfterDays: gap,
      campfireHighlight: (logs ?? []).find((l) => l.author_id === id && !l.is_coach)?.highlight ?? null,
      batonPasses: m.baton ? (passes ?? []).filter((x) => x.from_id === id).length : 0,
      propsReceived: got.reduce((s, x) => s + x.count, 0),
      topSticker: top ? (ALL_STICKERS[top[0]]?.label ?? null) : null,
      challengeJoined: (entries ?? []).filter((e) => e.athlete_id === id).map((e) => (e.pod_challenges as unknown as { title: string }).title),
    };
  });
  const people = facts.map(shapeMember).filter(Boolean);
  return {
    coachId: pod.coach_id as string,
    input: {
      pod: pod.name,
      week_of: week,
      members: people,
      baton: baton && (passes ?? []).length ? { handoffs_this_week: (passes ?? []).length, total_handoffs: baton.handoffs, current_chain: baton.chain, longest_chain: baton.longest } : null,
    },
  };
}

/** Coach's own words, so the draft sounds like them: recent "why" notes they wrote. */
async function voiceSamples(admin: SupabaseClient, coachId: string) {
  const { data } = await admin.from("planned_workouts").select("why").eq("coach_id", coachId).not("why", "is", null).order("why_updated_at", { ascending: false }).limit(6);
  return (data ?? []).map((r) => r.why as string).filter(Boolean);
}

export type DraftResult = { ok: true; id: string } | { ok: false; error: string };

/** Draft (or redraft) the episode for a pod's week. Saved as a coach-only draft. */
export async function draftEpisode(admin: SupabaseClient, podId: string, week: string, trigger: "cron" | "manual"): Promise<DraftResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "No Anthropic API key is configured." };
  const g = await gatherWeek(admin, podId, week);
  if (!g) return { ok: false, error: "No active members in this pod." };
  if (!g.input.members.length) return { ok: false, error: "Nothing shared with the pod that week to write about." };
  const { data: existing } = await admin.from("storylines").select("id, status").eq("pod_id", podId).eq("week", week).maybeSingle();
  if (existing?.status === "posted") return { ok: false, error: "That week's episode is already posted." };

  const { data: s } = await admin.from("coach_settings").select("ai_enabled, ai_monthly_cap_usd").eq("coach_id", g.coachId).maybeSingle();
  const settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  if (!settings.ai_enabled) return { ok: false, error: "The coaching assistant is turned off in Settings." };
  if ((await monthToDateSpend(g.coachId)) >= Number(settings.ai_monthly_cap_usd) - 0.01) return { ok: false, error: "Monthly AI cap reached." };

  const samples = await voiceSamples(admin, g.coachId);
  let response;
  try {
    response = await new Anthropic().beta.messages.parse({
      model: STORY_MODEL,
      max_tokens: 3000,
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(Output) },
      messages: [{ role: "user", content: `How the coach writes (their own notes to athletes):\n${samples.map((x) => `- ${x}`).join("\n") || "- (no samples yet: warm, direct, a bit playful)"}\n\nThe pod's week (JSON):\n${JSON.stringify(g.input)}` }],
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) return { ok: false, error: apiErrorText(e, "story") };
    throw e;
  }
  const costUsd = costOf(STORY_MODEL, response.usage);
  await admin.from("ai_usage").insert({ coach_id: g.coachId, model: STORY_MODEL, athletes: g.input.members.length, input_tokens: response.usage.input_tokens ?? 0, output_tokens: response.usage.output_tokens ?? 0, cache_read_tokens: response.usage.cache_read_input_tokens ?? 0, cache_write_tokens: response.usage.cache_creation_input_tokens ?? 0, cost_usd: costUsd.toFixed(5), stop_reason: response.stop_reason, trigger: "story" });
  const out = response.parsed_output;
  if (response.stop_reason === "refusal" || !out?.title || !out.body) return { ok: false, error: "The draft came back empty. Try again, or write it yourself." };

  const season = Number(week.slice(0, 4));
  const { count } = await admin.from("storylines").select("id", { count: "exact", head: true }).eq("pod_id", podId).eq("season", season).eq("status", "posted");
  const row = { pod_id: podId, coach_id: g.coachId, week, season, episode: (count ?? 0) + 1, title: out.title.trim().slice(0, 90), body: out.body.trim().slice(0, 3000), status: "draft", model: STORY_MODEL, cost_usd: costUsd.toFixed(5), created_at: new Date().toISOString() };
  const { data, error } = await admin.from("storylines").upsert(row, { onConflict: "pod_id,week" }).select("id").single();
  if (error || !data) return { ok: false, error: "Couldn't save the draft." };
  if (trigger === "cron") await admin.rpc("server_notify", { p_user: g.coachId, p_kind: "storyline", p_title: `Episode draft ready: ${row.title}`, p_body: "Read it, edit anything, then post it to the pod.", p_href: `/pods/${podId}#episode`, p_key: `story:${podId}:${week}` });
  return { ok: true, id: data.id };
}

/** Evening cron, Mondays (coach's time): draft last week's episode for each pod that has none. */
export async function draftWeeklyEpisodes(admin: SupabaseClient) {
  const { data: pods } = await admin.from("pods").select("id, profiles!pods_coach_id_fkey(timezone)");
  let drafted = 0;
  for (const p of pods ?? []) {
    const tz = (p.profiles as unknown as { timezone: string | null } | null)?.timezone || "America/Chicago";
    const now = new Date();
    if (now.toLocaleDateString("en-US", { weekday: "short", timeZone: tz }) !== "Mon") continue;
    const week = recapWeekFor(now.toLocaleDateString("en-CA", { timeZone: tz }));
    const { data: has } = await admin.from("storylines").select("id").eq("pod_id", p.id).eq("week", week).maybeSingle();
    if (has) continue;
    const r = await draftEpisode(admin, p.id, week, "cron").catch(() => ({ ok: false }));
    if (r.ok) drafted++;
  }
  return { drafted };
}

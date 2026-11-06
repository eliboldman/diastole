import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";

const db = new PGlite();
const migration = readdirSync(new URL("../migrations/", import.meta.url)).sort()
  .map((f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8")).join("\n")
  // PGlite has no pg_net; a stub below records the pings instead.
  .replace(/create extension if not exists pg_net[^;]*;/g, "");

// Minimal stand-in for Supabase's auth schema and roles.
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  create publication supabase_realtime;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert, delete on storage.objects to authenticated;
  grant execute on function auth.uid() to authenticated;
  create schema net;
  create table net.pings (id bigint generated always as identity, url text, body jsonb);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
    returns bigint language sql as $$ insert into net.pings (url, body) values (url, body) returning id $$;
`);
await db.exec(migration);
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
               revoke update on public.profiles from authenticated;
               grant update (full_name, timezone) on public.profiles to authenticated;`);

const COACH = "00000000-0000-0000-0000-00000000000c";
const A1 = "00000000-0000-0000-0000-0000000000a1";
const A2 = "00000000-0000-0000-0000-0000000000a2";
const STRANGER = "00000000-0000-0000-0000-0000000000ff";

// Coach signs up, is promoted manually, and is their own athlete.
await db.exec(`insert into auth.users (id, email) values ('${COACH}', 'coach@x.com');
  update public.profiles set role = 'coach', coach_id = id where id = '${COACH}';
  insert into public.invites (coach_id, email) values ('${COACH}', 'A1@x.com'), ('${COACH}', 'a2@x.com');
  insert into auth.users (id, email) values ('${A1}', 'a1@x.com'), ('${A2}', 'a2@x.com'), ('${STRANGER}', 's@x.com');
  insert into public.daily_wellness (athlete_id, date, source, hrv_ms) values
    ('${COACH}', '2026-11-02', 'garmin', 70), ('${A1}', '2026-11-02', 'garmin', 60), ('${A2}', '2026-11-02', 'apple', 50);
  insert into public.readiness_scores values ('${A1}', '2026-11-02', 'green','green','green','green','green','ok');
  insert into public.planned_workouts (athlete_id, coach_id, scheduled_date, sport, title) values ('${A1}', '${COACH}', '2026-11-03', 'run', 'Draft run');
`);

let pass = 0, fail = 0;
function check(name, ok) { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); }

async function as(user, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { error: e.message }; }
  finally { await db.exec("reset role;"); }
}

const prof = (await db.query(`select id, role, coach_id from public.profiles order by email`)).rows;
check("invited athletes attached to coach (email case-insensitive)", prof.filter(p => p.coach_id === COACH).length === 3);
check("uninvited stranger has no coach", prof.find(p => p.id === STRANGER).coach_id === null);

let r = await as(COACH, "select athlete_id from public.daily_wellness");
check("coach sees all 3 athletes' wellness", r.rows?.length === 3);
r = await as(A1, "select athlete_id from public.daily_wellness");
check("athlete sees only own wellness", r.rows?.length === 1 && r.rows[0].athlete_id === A1);
r = await as(STRANGER, "select * from public.daily_wellness");
check("stranger sees no wellness", r.rows?.length === 0);
r = await as(A1, "select id from public.profiles");
check("athlete sees self + coach only", r.rows?.length === 2);
r = await as(A2, "select * from public.readiness_scores");
check("athlete cannot see another athlete's readiness", r.rows?.length === 0);

r = await as(A2, `insert into public.daily_wellness (athlete_id, date, source, hrv_ms) values ('${A2}', '2026-11-03', 'apple', 55)`);
check("athlete can write own apple wellness", !r.error);
r = await as(A2, `insert into public.daily_wellness (athlete_id, date, source, hrv_ms) values ('${A2}', '2026-11-04', 'garmin', 55)`);
check("athlete cannot write garmin wellness", !!r.error);
r = await as(A2, `insert into public.daily_wellness (athlete_id, date, source, hrv_ms) values ('${A1}', '2026-11-04', 'apple', 55)`);
check("athlete cannot write another athlete's data", !!r.error);
r = await as(A1, `insert into public.readiness_scores values ('${A1}', '2026-11-03', 'green','green','green','green','green','x')`);
check("athlete cannot write readiness", !!r.error);

r = await as(A1, `update public.profiles set role = 'coach' where id = '${A1}'`);
check("athlete cannot promote self to coach", !!r.error);
r = await as(A1, `update public.profiles set coach_id = '${STRANGER}' where id = '${A1}'`);
check("athlete cannot change coach", !!r.error);
r = await as(A1, `update public.profiles set full_name = 'Al' where id = '${A1}' returning full_name`);
check("athlete can edit own name", r.rows?.[0]?.full_name === "Al");

r = await as(A1, "select * from public.planned_workouts");
check("athlete cannot see coach's drafts", r.rows?.length === 0);
r = await as(COACH, "select * from public.planned_workouts");
check("coach sees drafts", r.rows?.length === 1);
r = await as(COACH, `update public.planned_workouts set status = 'sent'`);
check("cannot mark sent without approval", !!r.error);
r = await as(COACH, `update public.planned_workouts set status = 'approved', approved_at = now()`);
check("coach can approve", !r.error);
r = await as(A1, "select * from public.planned_workouts");
check("athlete sees approved workout", r.rows?.length === 1);
r = await as(STRANGER, `insert into public.planned_workouts (athlete_id, coach_id, scheduled_date, sport, title) values ('${A1}', '${STRANGER}', '2026-11-03', 'run', 'x')`);
check("non-coach cannot assign workouts to someone else's athlete", !!r.error);
r = await as(A1, `insert into public.invites (coach_id, email) values ('${A1}', 'z@x.com')`);
check("athlete cannot create invites", !!r.error);
r = await as(A1, "select * from private.garmin_tokens");
check("athlete cannot read Garmin tokens", !!r.error);

r = await as(A1, `select * from public.get_garmin_tokens('${A1}')`);
check("athlete cannot call get_garmin_tokens", !!r.error);
r = await as(A1, `select public.save_garmin_tokens('${A1}', 'a', 'b', now())`);
check("athlete cannot call save_garmin_tokens", !!r.error);
r = await as(COACH, "select * from public.garmin_raw");
check("coach cannot read raw Garmin payloads", r.rows?.length === 0);
await db.exec("grant select, insert on public.garmin_webhook_log to authenticated;");
await db.exec("insert into public.garmin_webhook_log (host, outcome) values ('diastole.app', 'ok')");
r = await as(COACH, "select * from public.garmin_webhook_log");
check("coach can read the webhook log", r.rows?.length === 1);
r = await as(A1, "select * from public.garmin_webhook_log");
check("athlete cannot read the webhook log", r.rows?.length === 0);
r = await as(COACH, "insert into public.garmin_webhook_log (host, outcome) values ('x', 'ok')");
check("coach cannot write the webhook log", !!r.error);
await db.exec(`select public.save_garmin_tokens('${A1}', 'acc', 'ref', now() + interval '1 day')`);
const tok = (await db.query(`select * from public.get_garmin_tokens('${A1}')`)).rows;
check("server can save and read tokens", tok[0]?.access_token === "acc");

// ---------------------------------------------------------------- pods
await db.exec("grant select, insert, update, delete on public.pods, public.pod_members to authenticated;");
r = await as(COACH, "insert into public.pods (coach_id, name) values (auth.uid(), 'Tuesday Group') returning id");
const POD = r.rows?.[0]?.id;
check("coach can create a pod", Boolean(POD));
r = await as(A1, `insert into public.pods (coach_id, name) values ('${A1}', 'mine') returning id`);
check("athlete cannot create a pod", !!r.error);
r = await as(COACH, `insert into public.pod_members (pod_id, athlete_id) values ('${POD}', '${A1}'), ('${POD}', '${A2}')`);
check("coach can invite own athletes", !r.error);
r = await as(COACH, `insert into public.pod_members (pod_id, athlete_id) values ('${POD}', '${STRANGER}')`);
check("coach cannot invite someone else's athlete", !!r.error);
r = await as(A1, `insert into public.pod_members (pod_id, athlete_id, status) values ('${POD}', '${A1}', 'active')`);
check("athlete cannot add themselves as active", !!r.error);
r = await as(A1, `update public.pod_members set status = 'active' where pod_id = '${POD}'`);
check("athlete cannot flip status by direct update", !!r.error || (await db.query(`select status from public.pod_members where athlete_id='${A1}'`)).rows[0].status === "invited");

r = await as(A1, `select public.get_pod_feed('${POD}') as f`);
check("invited (not accepted) athlete cannot read the feed", !r.error && r.rows[0].f === null);
r = await as(A1, `select * from public.pods`);
check("invited athlete can see the pod name", r.rows?.length === 1);
r = await as(STRANGER, `select * from public.pods`);
check("stranger cannot see the pod", r.rows?.length === 0);

r = await as(A1, `select public.respond_to_pod('${POD}', 'accept')`);
check("athlete can accept", !r.error);
r = await as(A1, `select public.get_pod_feed('${POD}') as f`);
let feed = r.rows?.[0]?.f;
check("feed shows only accepted members (A2 still invited)", feed?.members?.length === 1 && feed.members[0].is_me === true);
check("feed never includes email", !JSON.stringify(feed ?? {}).includes("@x.com"));

r = await as(A2, `select public.respond_to_pod('${POD}', 'accept')`);
r = await as(A1, `select public.get_pod_feed('${POD}') as f`);
feed = r.rows?.[0]?.f;
const a2 = feed?.members?.find((m) => m.id === A2);
check("after both accept, A2's health data stays hidden by default", (a2?.wellness?.length ?? 0) === 0 && a2?.readiness == null && (a2?.activities?.length ?? 0) === 0);
// A2 shares readiness, training and HRV only.
await as(A2, `select public.set_pod_sharing(2, true, false, false, false)`);
r = await as(A1, `select public.get_pod_feed('${POD}') as f`);
const a2b = r.rows?.[0]?.f?.members?.find((m) => m.id === A2);
check("after opting in, A1 sees A2's HRV but not sleep or stress", a2b?.wellness?.length >= 1 && a2b.wellness.every((w) => w.sleep_seconds === null && w.stress_avg === null) && a2b.wellness.some((w) => w.hrv_ms !== null));
await as(A1, `select public.set_pod_sharing(2, false, false, false, false)`);
r = await as(A1, `select * from public.daily_wellness where athlete_id = '${A2}'`);
check("pod membership does not open the base tables", r.rows?.length === 0);
r = await as(STRANGER, `select public.get_pod_feed('${POD}') as f`);
check("stranger cannot read the feed", !r.error && r.rows[0].f === null);
r = await as(A1, `select public.respond_to_pod('${POD}', 'accept') as s`);
check("cannot accept twice", r.rows?.[0]?.s === null);

r = await as(A2, `select public.respond_to_pod('${POD}', 'leave')`);
r = await as(A1, `select public.get_pod_feed('${POD}') as f`);
check("after A2 leaves, A1 no longer sees A2", !r.rows?.[0]?.f?.members?.some((m) => m.id === A2));
r = await as(A2, `select public.get_pod_feed('${POD}') as f`);
check("A2 who left can no longer read the feed", !r.error && r.rows[0].f === null);
r = await as(COACH, `select public.reinvite_to_pod('${POD}', '${A2}')`);
check("coach can re-invite", !r.error && (await db.query(`select status from public.pod_members where athlete_id='${A2}'`)).rows[0].status === "invited");
r = await as(A1, `select public.reinvite_to_pod('${POD}', '${A2}') as ok`);
check("athlete cannot re-invite", r.rows?.[0]?.ok === false);

// ---------------------------------------------------------------- workout details (opt-in pod sharing)
const ACT1 = "00000000-0000-0000-0000-0000000001a1";
const ACT2 = "00000000-0000-0000-0000-0000000001a2";
await db.exec(`
  update public.pod_members set status = 'active' where pod_id = '${POD}' and athlete_id in ('${A1}', '${A2}');
  insert into public.activities (id, athlete_id, source, external_id, sport, start_time) values
    ('${ACT1}', '${A1}', 'garmin', 'x1', 'running', now()), ('${ACT2}', '${A2}', 'garmin', 'x2', 'running', now());
  insert into public.activity_details (activity_id, athlete_id, source, streams) values
    ('${ACT1}', '${A1}', 'garmin_fit', '{"t":[0]}'), ('${ACT2}', '${A2}', 'garmin_fit', '{"t":[0]}');
`);
const seesA2 = async (user) => {
  const d = await as(user, `select activity_id from public.activity_details where athlete_id = '${A2}'`);
  const a = await as(user, `select id from public.activities where id = '${ACT2}'`);
  return d.rows?.length === 1 && a.rows?.length === 1;
};
check("pod mates can't see each other's details by default", !(await seesA2(A1)));
r = await as(A2, "select public.set_share_workout_details(true)");
check("only one side opted in: still hidden", !r.error && !(await seesA2(A1)));
await as(A1, "select public.set_share_workout_details(true)");
check("both opted in: pod mate sees details", await seesA2(A1));
const feedA2 = async () => (await as(A1, `select public.get_pod_feed('${POD}') as f`)).rows?.[0]?.f?.members?.find((m) => m.id === A2);
check("feed marks A2's details as openable and includes activity ids", (await feedA2())?.details === true && (await feedA2())?.activities?.[0]?.id === ACT2);
await as(STRANGER, "select public.set_share_workout_details(true)");
check("opted-in stranger outside the pod sees nothing", !(await seesA2(STRANGER)));
check("coach always sees details", await seesA2(COACH));
r = await as(A1, `select activity_id from public.activity_details`);
check("athlete sees own details too", r.rows?.some((x) => x.activity_id === ACT1));
check("share switch only changes the caller", (await db.query(`select count(*)::int c from public.profiles where share_workout_details`)).rows[0].c === 3);
r = await as(A1, `insert into public.activity_details (activity_id, athlete_id, source, streams) values ('${ACT1}', '${A1}', 'apple', '{}')`);
check("athletes cannot write activity details", !!r.error);
await as(A2, "select public.set_share_workout_details(false)");
check("turning sharing off hides details again", !(await seesA2(A1)));
check("feed no longer marks details as openable", (await feedA2())?.details === false);
await as(A2, "select public.set_share_workout_details(true)");
await as(A2, `select public.respond_to_pod('${POD}', 'leave')`);
check("after leaving the pod, details are hidden", !(await seesA2(A1)));

r = await as(COACH, `insert into public.athlete_zones (athlete_id, max_hr) values ('${A1}', 195)`);
check("coach can set an athlete's zones", !r.error);
r = await as(A1, `update public.athlete_zones set max_hr = 230 where athlete_id = '${A1}' returning max_hr`);
check("athlete cannot change their zones", !!r.error || r.rows?.length === 0);
r = await as(A1, `select max_hr from public.athlete_zones where athlete_id = '${A1}'`);
check("athlete can read their zones", r.rows?.[0]?.max_hr === 195);
r = await as(STRANGER, `insert into public.athlete_zones (athlete_id, max_hr) values ('${A2}', 150)`);
check("stranger cannot set zones", !!r.error);

// ---------------------------------------------------------------- form insights (coach-only)
await db.exec(`insert into public.form_insights (coach_id, athlete_id, issue_key, summary) values ('${COACH}', '${A1}', 'gct:level', 'Long ground contact')`);
r = await as(COACH, "select issue_key from public.form_insights");
check("coach reads their form insights", r.rows?.length === 1);
r = await as(A1, "select * from public.form_insights");
check("athletes never see form insights, even about themselves", r.rows?.length === 0);
r = await as(A1, `update public.form_insights set status = 'dismissed' returning id`);
check("athletes cannot change form insights", !!r.error || r.rows?.length === 0);
r = await as(COACH, `update public.form_insights set status = 'dismissed' returning status`);
check("coach can dismiss", r.rows?.[0]?.status === "dismissed");
r = await as(COACH, `insert into public.form_insights (coach_id, athlete_id, issue_key, summary) values ('${COACH}', '${A1}', 'x', 'y')`);
check("only the server writes form insights", !!r.error);
await db.exec(`insert into public.ai_usage (coach_id, model, athletes, input_tokens, output_tokens, cost_usd, trigger) values ('${COACH}', 'm', 1, 1, 1, 0, 'form')`);
check("ai_usage accepts form runs", true);

// ---------------------------------------------------------------- activity props + daily reset
// State here: A1 active in POD, A2 left, COACH is the pod's coach.
r = await as(COACH, `select public.send_pod_props('${POD}', '${A1}', 'goat', 5, 'nice run', '${ACT1}') as e`);
check("coach gives props on A1's activity", !r.error && r.rows?.[0]?.e === null);
r = await as(COACH, `select public.send_pod_props('${POD}', '${A1}', 'goat', 1, null, '${ACT2}') as e`);
check("props can't be pinned to someone else's activity", r.rows?.[0]?.e === "That workout isn't theirs.");
r = await as(A1, `select public.send_pod_props('${POD}', '${A1}', 'goat', 1, null, '${ACT1}') as e`);
check("no props on your own activity", r.rows?.[0]?.e === "self");
r = await as(COACH, `select public.send_pod_props('${POD}', '${A1}', 'clap', 3) as e`);
check("member-card props still work", r.rows?.[0]?.e === null);
await db.exec(`insert into public.pod_props (pod_id, from_id, to_id, sticker, count, created_at) values ('${POD}', '${COACH}', '${A1}', 'clap', 7, now() - interval '2 days')`);
r = await as(A1, `select public.get_pod_props('${POD}') as p`);
const props = r.rows?.[0]?.p;
const clap = props?.totals?.find((t) => t.sticker === "clap");
check("member totals count today only, with all-time alongside", clap?.total === 3 && clap?.all_time === 10);
check("activity props stay off the member card", !props?.totals?.some((t) => t.sticker === "goat"));
check("recent sends say which activity", props?.recent?.some((x) => x.activity_id === ACT1 && x.activity_sport === "running"));
r = await as(A1, `select public.get_pod_activity_feed('${POD}') as f`);
const item = r.rows?.[0]?.f?.find((x) => x.id === ACT1);
check("activity feed shows the activity with its props and note", item?.props?.[0]?.sticker === "goat" && item?.props?.[0]?.total === 5 && item?.comments?.[0]?.note === "nice run");
check("feed leaves out members who left", !r.rows?.[0]?.f?.some((x) => x.id === ACT2));
r = await as(STRANGER, `select public.get_pod_activity_feed('${POD}') as f`);
check("strangers get no activity feed", r.rows?.[0]?.f === null);
r = await as(A2, `select public.get_pod_activity_feed('${POD}') as f`);
check("former members get no activity feed", r.rows?.[0]?.f === null);
r = await as(A1, `select public.get_pod_activity_feed('${POD}', now() - interval '1 day') as f`);
check("feed pages by start time", Array.isArray(r.rows?.[0]?.f) && r.rows[0].f.length === 0);
const note = (await db.query(`select title, href from public.notifications where user_id = '${A1}' and kind = 'pod_props' and href like '%view=feed'`)).rows[0];
check("activity props notify with a link to the pod feed", note?.href === `/me/pods/${POD}?view=feed` && /on your running/.test(note?.title ?? ""));
await as(A1, `select public.hide_pod_props('${POD}', 'goat', '${ACT1}')`);
r = await as(A1, `select public.get_pod_activity_feed('${POD}') as f`);
check("recipient can hide a sticker on their activity", !r.rows?.[0]?.f?.find((x) => x.id === ACT1)?.props?.length);
r = await as(COACH, `select public.get_pod_activity_feed('${POD}') as f`);
check("coach still sees hidden activity props", r.rows?.[0]?.f?.find((x) => x.id === ACT1)?.props?.[0]?.hidden === true);

// ---------------------------------------------------------------- activity names + comments
await db.exec(`update public.activities set name = 'Morning Run', raw = '{"activityName":"Morning Run"}' where id = '${ACT1}'`);
r = await as(A1, `select public.rename_activity('${ACT1}', '  Hill   repeats ') as e`);
const nameOf = async () => (await db.query(`select name, name_locked from public.activities where id = '${ACT1}'`)).rows[0];
check("owner renames their activity (whitespace tidied)", r.rows?.[0]?.e === null && (await nameOf()).name === "Hill repeats" && (await nameOf()).name_locked);
await db.exec(`update public.activities set name = 'Morning Run', avg_hr = 150 where id = '${ACT1}'`);
check("a Garmin sync keeps the chosen name but updates the rest", (await nameOf()).name === "Hill repeats" && Number((await db.query(`select avg_hr from public.activities where id = '${ACT1}'`)).rows[0].avg_hr) === 150);
r = await as(COACH, `select public.rename_activity('${ACT1}', 'Coach title') as e`);
check("coach can rename an athlete's activity", r.rows?.[0]?.e === null && (await nameOf()).name === "Coach title");
r = await as(STRANGER, `select public.rename_activity('${ACT1}', 'x') as e`);
check("strangers can't rename", r.rows?.[0]?.e === "You can't rename that workout." && (await nameOf()).name === "Coach title");
r = await as(A1, `select public.rename_activity('${ACT1}', '${"x".repeat(81)}') as e`);
check("names are capped at 80", r.rows?.[0]?.e === "Keep the name to 80 characters.");
r = await as(A1, `select public.rename_activity('${ACT1}', '') as e`);
check("clearing the name restores the watch's name and unlocks it", (await nameOf()).name === "Morning Run" && !(await nameOf()).name_locked);
r = await as(A1, `update public.activities set name = 'sneaky' where id = '${ACT1}' returning id`);
check("no direct name edits", !!r.error || r.rows?.length === 0);

r = await as(COACH, `select public.send_pod_props('${POD}', '${A1}', 'comment', 99, 'Strong finish!', '${ACT1}') as e`);
check("coach comments on an activity", r.rows?.[0]?.e === null);
r = await as(A1, `select public.send_pod_props('${POD}', '${A1}', 'comment', 1, 'thanks coach', '${ACT1}') as e`);
check("owner can reply on their own activity", r.rows?.[0]?.e === null);
r = await as(A1, `select public.send_pod_props('${POD}', '${A1}', 'clap', 1, null, '${ACT1}') as e`);
check("owner still can't props themselves", r.rows?.[0]?.e === "self");
r = await as(COACH, `select public.send_pod_props('${POD}', '${A1}', 'comment', 1, '   ', '${ACT1}') as e`);
check("empty comments are refused", r.rows?.[0]?.e === "Write something first.");
r = await as(COACH, `select public.send_pod_props('${POD}', '${A1}', 'comment', 1, 'hi') as e`);
check("comments need an activity", r.rows?.[0]?.e === "Write something first.");
r = await as(COACH, `select public.get_pod_activity_feed('${POD}') as f`);
const it2 = r.rows?.[0]?.f?.find((x) => x.id === ACT1);
check("comments show in order, count included, never as props", it2?.comments?.map((c) => c.note).slice(-2).join("|") === "Strong finish!|thanks coach" && it2?.comment_count >= 2 && !it2?.props?.some((p) => p.sticker === "comment"));
check("feed says who can rename", it2?.can_rename === true);
check("comment counted as 1 whatever was sent", (await db.query(`select count from public.pod_props where note = 'Strong finish!'`)).rows[0].count === 1);
const cmt = (await db.query(`select title, body from public.notifications where user_id = '${A1}' and meta ->> 'comment' = 'true'`)).rows;
check("comment notifies the owner with the text, replies don't notify yourself", cmt.length === 1 && cmt[0].body === "Strong finish!" && /commented on your running/.test(cmt[0].title));
r = await as(A1, `select public.get_pod_props('${POD}') as p`);
check("comments stay off the member card and recent list", !r.rows?.[0]?.p?.recent?.some((x) => x.sticker === "comment"));
const cid = (await db.query(`select id from public.pod_props where note = 'thanks coach'`)).rows[0].id;
await as(COACH, `select public.delete_pod_comment('${cid}')`);
check("only the author can delete a comment", (await db.query(`select count(*)::int c from public.pod_props where id = '${cid}'`)).rows[0].c === 1);
await as(A1, `select public.delete_pod_comment('${cid}')`);
check("author deletes their comment", (await db.query(`select count(*)::int c from public.pod_props where id = '${cid}'`)).rows[0].c === 0);

// ---------------------------------------------------------------- messages
// State: A1 active in POD, A2 left the pod (still coached by COACH), STRANGER has no coach.
r = await as(A1, `select public.open_direct_conversation('${COACH}') as id`);
const DM1 = r.rows?.[0]?.id;
check("athlete opens a thread with their coach", Boolean(DM1));
r = await as(COACH, `select public.open_direct_conversation('${A1}') as id`);
check("coach opening the same pair gets the same thread", r.rows?.[0]?.id === DM1);
r = await as(A1, `select public.open_direct_conversation('${A2}') as id`);
check("athletes can't DM each other", r.rows?.[0]?.id === null);
r = await as(STRANGER, `select public.open_direct_conversation('${COACH}') as id`);
check("someone without this coach can't open a thread", r.rows?.[0]?.id === null);

const M1 = "00000000-0000-0000-0000-00000000aa01";
r = await as(A1, `insert into public.messages (id, conversation_id, sender_id, body, created_at) values ('${M1}', '${DM1}', '${A1}', 'Legs felt heavy today', '2000-01-01')`);
check("athlete sends a message", !r.error);
check("server sets the time", (await db.query(`select created_at > now() - interval '1 minute' as ok from public.messages where id = '${M1}'`)).rows[0].ok);
r = await as(A1, `insert into public.messages (conversation_id, sender_id, body) values ('${DM1}', '${COACH}', 'spoof')`);
check("can't send as someone else", !!r.error);
r = await as(COACH, `select body from public.messages where conversation_id = '${DM1}'`);
check("coach reads it", r.rows?.[0]?.body === "Legs felt heavy today");
r = await as(A2, `select * from public.messages where conversation_id = '${DM1}'`);
check("another athlete can't read it", r.rows?.length === 0);
r = await as(A2, `insert into public.messages (conversation_id, sender_id, body) values ('${DM1}', '${A2}', 'hi')`);
check("non-members can't post", !!r.error);
r = await as(A1, `insert into public.messages (conversation_id, sender_id, body, activity_id) values ('${DM1}', '${A1}', 'see this', '${ACT2}')`);
check("can't link a workout you can't see", !!r.error);
r = await as(A1, `insert into public.messages (conversation_id, sender_id, body, activity_id) values ('${DM1}', '${A1}', 'see this', '${ACT1}')`);
check("can link your own workout", !r.error);
r = await as(A1, `insert into public.messages (conversation_id, sender_id, media_kind, media_path) values ('${DM1}', '${A1}', 'photo', '${DM1}/a.jpg')`);
check("photo message in this thread's folder", !r.error);
r = await as(A1, `insert into public.messages (conversation_id, sender_id, media_kind, media_path) values ('${DM1}', '${A1}', 'photo', 'elsewhere/a.jpg')`);
check("media must live in this thread's folder", !!r.error);

const n1 = (await db.query(`select title, body, href, read_at from public.notifications where user_id = '${COACH}' and dedupe_key = 'msg:${DM1}'`)).rows;
check("coach gets one folded message notification, latest preview", n1.length === 1 && n1[0].body === "📷 Photo" && n1[0].href === `/messages/${DM1}`);
r = await as(COACH, `select public.get_inbox() as i`);
const inboxRow = r.rows?.[0]?.i?.find((x) => x.id === DM1);
check("inbox shows the thread with unread count and preview", inboxRow?.unread === 3 && inboxRow?.last?.media_kind === "photo");
r = await as(A1, `select public.get_inbox() as i`);
check("sender has nothing unread", r.rows?.[0]?.i?.find((x) => x.id === DM1)?.unread === 0);
r = await as(COACH, `select public.unread_message_count() as n`);
check("coach total unread", r.rows?.[0]?.n === 3);
await as(COACH, `select public.mark_conversation_read('${DM1}')`);
r = await as(COACH, `select public.get_inbox() as i`);
check("reading clears unread", r.rows?.[0]?.i?.find((x) => x.id === DM1)?.unread === 0);
check("reading clears the notification", (await db.query(`select read_at from public.notifications where dedupe_key = 'msg:${DM1}'`)).rows[0].read_at !== null);
r = await as(A1, `select public.get_conversation('${DM1}') as c`);
const conv = r.rows?.[0]?.c;
check("thread view has title, people and read times", conv?.title && conv?.people?.length === 2 && conv?.reads?.[COACH]);
r = await as(STRANGER, `select public.get_conversation('${DM1}') as c`);
check("outsiders get nothing", r.rows?.[0]?.c === null);
r = await as(A1, `select * from public.conversation_reads where conversation_id = '${DM1}'`);
check("members see each other's read times (for Seen)", r.rows?.length === 2);

r = await as(COACH, `select public.delete_message('${M1}') as p`);
check("only the sender can delete", (await db.query(`select deleted_at from public.messages where id = '${M1}'`)).rows[0].deleted_at === null);
await as(A1, `select public.delete_message('${M1}')`);
check("sender deletes (soft)", (await db.query(`select deleted_at from public.messages where id = '${M1}'`)).rows[0].deleted_at !== null);
r = await as(A1, `update public.messages set body = 'edited' where id = '${M1}' returning id`);
check("no direct edits", !!r.error || r.rows?.length === 0);

// Pod thread
r = await as(A1, `select public.open_pod_conversation('${POD}') as id`);
const PODC = r.rows?.[0]?.id;
check("active member opens the pod thread", Boolean(PODC));
r = await as(A2, `select public.open_pod_conversation('${POD}') as id`);
check("former member can't", r.rows?.[0]?.id === null);
r = await as(COACH, `insert into public.messages (conversation_id, sender_id, body) values ('${PODC}', '${COACH}', 'Team run Saturday')`);
check("coach posts in the pod thread", !r.error);
r = await as(A1, `select body from public.messages where conversation_id = '${PODC}'`);
check("member reads the pod thread", r.rows?.length === 1);
r = await as(A2, `select body from public.messages where conversation_id = '${PODC}'`);
check("former member can't read it", r.rows?.length === 0);
check("pod message notifies members with the pod name", /in Tuesday Group/.test((await db.query(`select title from public.notifications where user_id = '${A1}' and dedupe_key = 'msg:${PODC}'`)).rows[0]?.title ?? ""));

// Storage paths
r = await as(A1, `insert into storage.objects (bucket_id, name, owner_id) values ('message-media', '${DM1}/x.jpg', '${A1}')`);
check("member uploads into the thread folder", !r.error);
r = await as(A2, `insert into storage.objects (bucket_id, name, owner_id) values ('message-media', '${DM1}/y.jpg', '${A2}')`);
check("non-member can't upload there", !!r.error);
r = await as(A2, `select name from storage.objects where bucket_id = 'message-media'`);
check("non-member can't read the files", r.rows?.length === 0);
r = await as(A1, `insert into storage.objects (bucket_id, name, owner_id) values ('message-media', '../${DM1}/z.jpg', '${A1}')`);
check("odd paths are refused", !!r.error);

// Coach drops the athlete: the thread closes for both.
await db.exec(`update public.profiles set coach_id = null where id = '${A1}'`);
r = await as(A1, `select * from public.messages where conversation_id = '${DM1}'`);
check("a removed athlete loses the thread", r.rows?.length === 0);
await db.exec(`update public.profiles set coach_id = '${COACH}' where id = '${A1}'`);

// ---------------------------------------------------------------- avatars, goals, achievements (Phase 8)
// State: A1 active in POD (COACH coaches it), A2 coached by COACH but left the pod, STRANGER unrelated.
r = await as(A1, `insert into public.avatars (athlete_id, look) values ('${A1}', '{"body":"b","skin":"s3"}') returning athlete_id`);
check("athlete saves their avatar", !r.error);
r = await as(A1, `insert into public.avatars (athlete_id, look) values ('${A2}', '{}')`);
check("can't save someone else's avatar", !!r.error);
r = await as(A1, `update public.avatars set look = '{"body":"a"}' where athlete_id = '${A1}' returning athlete_id`);
check("athlete edits their avatar", r.rows?.length === 1);
r = await as(COACH, `select public.get_avatars(array['${A1}']::uuid[]) as a`);
check("coach sees their athlete's avatar", r.rows?.[0]?.a?.[A1]?.body === "a");
r = await as(STRANGER, `select public.get_avatars(array['${A1}']::uuid[]) as a`);
check("strangers don't", JSON.stringify(r.rows?.[0]?.a) === "{}");
await db.exec(`insert into public.avatars (athlete_id, look) values ('${A2}', '{"body":"b"}'), ('${COACH}', '{"body":"a"}')`);
r = await as(A1, `select public.get_avatars(array['${A2}', '${COACH}']::uuid[]) as a`);
check("a former pod mate's avatar is hidden; the coach's shows", !r.rows?.[0]?.a?.[A2] && Boolean(r.rows?.[0]?.a?.[COACH]));
await as(A2, `select public.respond_to_pod('${POD}', 'accept')`);
const a2status = (await db.query(`select status from public.pod_members where athlete_id = '${A2}' and pod_id = '${POD}'`)).rows[0]?.status;
if (a2status === "active") {
  r = await as(A1, `select public.get_avatars(array['${A2}']::uuid[]) as a`);
  check("active pod mates see each other's avatars", Boolean(r.rows?.[0]?.a?.[A2]));
}
r = await as(A1, `insert into public.avatars (athlete_id, look) values ('${A1}', '${JSON.stringify({ junk: "x".repeat(9000) })}') on conflict (athlete_id) do update set look = excluded.look`);
check("oversized looks are refused", !!r.error);

r = await as(COACH, `insert into public.athlete_goals (athlete_id, race_name, race_date) values ('${A1}', 'City Half', '2027-03-01')`);
check("coach sets a goal race", !r.error);
r = await as(A1, `select race_name from public.athlete_goals where athlete_id = '${A1}'`);
check("athlete reads it", r.rows?.[0]?.race_name === "City Half");
r = await as(A1, `update public.athlete_goals set race_name = 'Mine' where athlete_id = '${A1}' returning athlete_id`);
check("athlete can't change it", !!r.error || r.rows?.length === 0);
r = await as(STRANGER, `select * from public.athlete_goals`);
check("strangers can't read goals", r.rows?.length === 0);

await as(COACH, `update public.athlete_zones set ftp_w = 260, threshold_hr = 172 where athlete_id = '${A1}'`);
r = await as(A1, `select field, value from public.zone_history where athlete_id = '${A1}' order by changed_at`);
check("zone changes are kept as history", r.rows?.some((x) => x.field === "ftp_w" && Number(x.value) === 260) && r.rows?.some((x) => x.field === "threshold_hr"));
r = await as(A1, `insert into public.achievements (athlete_id, key, value, achieved_at) values ('${A1}', 'pr_5k', 1200, now())`);
check("athletes can't write achievements", !!r.error);
await db.exec(`insert into public.achievements (athlete_id, key, value, achieved_at) values ('${A1}', 'pr_5k', 1200, now())`);
r = await as(COACH, `select key from public.achievements where athlete_id = '${A1}'`);
check("coach reads achievements", r.rows?.length === 1);
r = await as(A2, `select key from public.achievements where athlete_id = '${A1}'`);
check("other athletes don't", r.rows?.length === 0);

// ---------------------------------------------------------------- muscles worked
await db.exec(`insert into public.activity_strain (activity_id, athlete_id, auto) values ('${ACT1}', '${A1}', '{"quads":2,"calves":3}')`);
r = await as(A1, `select public.set_activity_strain('${ACT1}', '{"quads":3,"glutes":1}') as e`);
check("athlete edits the muscles worked", r.rows?.[0]?.e === null);
const strainRow = (await db.query(`select auto, custom, reviewed_at from public.activity_strain where activity_id = '${ACT1}'`)).rows[0];
check("their map is kept beside the estimate and marked reviewed", strainRow.custom?.quads === 3 && strainRow.auto?.calves === 3 && strainRow.reviewed_at !== null);
r = await as(A1, `select public.set_activity_strain('${ACT1}', '{"nose":2}') as e`);
check("unknown muscles are refused", r.rows?.[0]?.e === "Unknown muscle or level.");
r = await as(A1, `select public.set_activity_strain('${ACT1}', '{"quads":5}') as e`);
check("levels stay 1-3", r.rows?.[0]?.e === "Unknown muscle or level.");
r = await as(COACH, `select public.set_activity_strain('${ACT1}', null) as e`);
check("coach can reset it to the estimate", r.rows?.[0]?.e === null && (await db.query(`select custom from public.activity_strain where activity_id = '${ACT1}'`)).rows[0].custom === null);
r = await as(STRANGER, `select public.set_activity_strain('${ACT1}', '{"quads":1}') as e`);
check("strangers can't", r.rows?.[0]?.e === "You can't change that workout.");
r = await as(A1, `insert into public.activity_strain (activity_id, athlete_id, auto) values ('${ACT2}', '${A2}', '{}')`);
check("estimates are written by the server only", !!r.error);
r = await as(COACH, `select auto from public.activity_strain where activity_id = '${ACT1}'`);
check("coach reads it", r.rows?.length === 1);
r = await as(STRANGER, `select * from public.activity_strain`);
check("strangers can't read it", r.rows?.length === 0);

// ---------------------------------------------------------------- dismissing notifications
// The harness grants every table broadly at setup; restore the migrations' column grants here.
await db.exec(`revoke update on public.notifications from authenticated; grant update (read_at, dismissed_at) on public.notifications to authenticated;`);
const nid = (await db.query(`select id from public.notifications where user_id = '${A1}' limit 1`)).rows[0]?.id;
r = await as(A1, `update public.notifications set dismissed_at = now() where id = '${nid}' returning id`);
check("you can clear your own notification", r.rows?.length === 1);
const other = (await db.query(`select id from public.notifications where user_id <> '${A1}' limit 1`)).rows[0]?.id;
r = await as(A1, `update public.notifications set dismissed_at = now() where id = '${other}' returning id`);
check("but not someone else's", !!r.error || r.rows?.length === 0);
r = await as(A1, `update public.notifications set title = 'x' where id = '${nid}' returning id`);
check("and nothing but read/dismissed", !!r.error);
// New activity on a cleared row brings it back.
await db.exec(`update public.notifications set dismissed_at = now() where user_id = '${COACH}' and dedupe_key = 'msg:${DM1}'`);
await as(A1, `insert into public.messages (conversation_id, sender_id, body) values ('${DM1}', '${A1}', 'one more thing')`);
check("a new message resurfaces a cleared notification", (await db.query(`select dismissed_at from public.notifications where user_id = '${COACH}' and dedupe_key = 'msg:${DM1}'`)).rows[0]?.dismissed_at === null);
await as(COACH, `select public.mark_conversation_read('${DM1}')`);
check("reading the chat clears it", (await db.query(`select dismissed_at from public.notifications where user_id = '${COACH}' and dedupe_key = 'msg:${DM1}'`)).rows[0]?.dismissed_at !== null);

// ---------------------------------------------------------------- pod profiles: sharing levels
await db.exec(`update public.pod_members set status = 'active' where pod_id = '${POD}' and athlete_id in ('${A1}', '${A2}')`);
await as(A2, `select public.set_pod_sharing(0, false, false, false, false)`);
r = await as(A1, `select public.get_pod_profile('${A2}') as p`);
let pp = r.rows?.[0]?.p;
check("level 0: a pod mate gets name and avatar only", pp?.name && pp.readiness == null && pp.activities == null && pp.achievements == null && pp.wellness == null && pp.strain == null);
r = await as(A1, `select public.get_pod_activity_feed('${POD}') as f`);
check("level 0: their workouts stay out of the feed", !r.rows?.[0]?.f?.some((x) => x.athlete_id === A2));
r = await as(A1, `select * from public.achievements where athlete_id = '${A2}'`);
check("level 0: no PRs through the table either", r.rows?.length === 0);
await db.exec(`insert into public.readiness_scores values ('${A2}', current_date, 'yellow','yellow','green','green','yellow','Take it easy') on conflict do nothing`);
r = await as(A1, `select * from public.readiness_scores where athlete_id = '${A2}'`);
check("level 0: readiness hidden", r.rows?.length === 0);

await as(A2, `select public.set_pod_sharing(1, false, false, false, false)`);
r = await as(A1, `select public.get_pod_profile('${A2}') as p`);
pp = r.rows?.[0]?.p;
check("level 1: readiness shows, training doesn't", pp?.readiness?.note === "Take it easy" && pp.activities == null);
r = await as(A1, `select * from public.readiness_scores where athlete_id = '${A2}'`);
check("level 1: readiness readable through the table too", r.rows?.length >= 1);

await as(A2, `select public.set_pod_sharing(2, false, true, false, false)`);
r = await as(A1, `select public.get_pod_profile('${A2}') as p`);
pp = r.rows?.[0]?.p;
check("level 2: workouts and PRs show; sleep only because it's opted in", Array.isArray(pp?.activities) && Array.isArray(pp?.achievements) && pp.wellness?.every((w) => w.hrv_ms === null));
r = await as(A1, `select public.get_pod_activity_feed('${POD}') as f`);
check("level 2: workouts appear in the feed", r.rows?.[0]?.f?.some((x) => x.athlete_id === A2));
r = await as(STRANGER, `select public.get_pod_profile('${A2}') as p`);
check("people outside the pod get nothing", r.rows?.[0]?.p === null);
await as(A2, `select public.set_pod_sharing(0, false, false, false, false)`);
r = await as(COACH, `select public.pod_can_see('${A2}', 'hrv') as h, public.pod_can_see('${A2}', 'training') as t`);
check("their coach always sees everything", r.rows?.[0]?.h === true && r.rows?.[0]?.t === true);
r = await as(A2, `select public.set_pod_sharing(0, false, false, false, true)`);
check("sharing workout details lifts you to the training level", (await db.query(`select pod_share_level, share_workout_details from public.profiles where id = '${A2}'`)).rows[0].pod_share_level === 2);

// Notification preferences
await as(A1, `select public.set_notify_prefs('{"props": false, "bogus": false, "messages": "no"}')`);
const prefs = (await db.query(`select notify_prefs from public.profiles where id = '${A1}'`)).rows[0].notify_prefs;
check("prefs keep known groups with true/false only", prefs?.props === false && Object.keys(prefs).length === 1);
const before = (await db.query(`select count(*)::int c from public.notifications where user_id = '${A1}' and kind = 'pod_props'`)).rows[0].c;
await as(COACH, `select public.send_pod_props('${POD}', '${A1}', 'fire', 2)`);
check("props notifications are skipped when turned off", (await db.query(`select count(*)::int c from public.notifications where user_id = '${A1}' and kind = 'pod_props'`)).rows[0].c === before);
await as(COACH, `select public.send_pod_props('${POD}', '${A1}', 'comment', 1, 'still notified', '${ACT1}')`);
check("comments still come through", (await db.query(`select count(*)::int c from public.notifications where user_id = '${A1}' and meta ->> 'comment' = 'true'`)).rows[0].c >= 1);

// ---------------------------------------------------------------- post-workout check-ins
r = await as(A1, `insert into public.workout_checkins (activity_id, athlete_id, feel, rpe, pain, note) values ('${ACT1}', '${A1}', 4, 7, '{"knee_l": 1}', 'Legs heavy')`);
check("athlete checks in on their own workout", !r.error);
r = await as(A1, `insert into public.workout_checkins (activity_id, athlete_id, feel) values ('${ACT2}', '${A1}', 3)`);
check("not on someone else's workout", !!r.error);
r = await as(A1, `update public.workout_checkins set pain = '{"elbow": 2}' where activity_id = '${ACT1}' returning activity_id`);
check("pain spots must be known and sided", !!r.error);
r = await as(A1, `update public.workout_checkins set rpe = 11 where activity_id = '${ACT1}' returning activity_id`);
check("RPE stays 1-10", !!r.error);
const painNotes = async () => (await db.query(`select count(*)::int c from public.notifications where user_id = '${COACH}' and kind = 'checkin_pain'`)).rows[0].c;
check("mild pain doesn't ping the coach", (await painNotes()) === 0);
await db.exec(`update public.profiles set notify_prefs = '{}' where id = '${COACH}'`);
r = await as(A1, `update public.workout_checkins set pain = '{"knee_l": 2, "calf_r": 3}' where activity_id = '${ACT1}' returning activity_id`);
check("moderate/severe pain saves", r.rows?.length === 1);
const pn = (await db.query(`select title, body, href from public.notifications where user_id = '${COACH}' and kind = 'checkin_pain'`)).rows;
check("and notifies the coach once, naming the spots", pn.length === 1 && /knee \(left\), moderate/.test(pn[0].body) && /calf \(right\), severe/.test(pn[0].body) && pn[0].href === `/activity/${ACT1}#checkin`);
await as(A1, `update public.workout_checkins set pain = '{"knee_l": 3}' where activity_id = '${ACT1}'`);
check("updates refresh the same notification", (await painNotes()) === 1);
r = await as(COACH, `select feel, rpe, note from public.workout_checkins where activity_id = '${ACT1}'`);
check("coach reads the check-in", r.rows?.[0]?.rpe === 7);
r = await as(A2, `select * from public.workout_checkins`);
check("pod mates never see check-ins", r.rows?.length === 0);
r = await as(COACH, `update public.workout_checkins set note = 'coach edit' where activity_id = '${ACT1}' returning activity_id`);
check("coach can't edit it", !!r.error || r.rows?.length === 0);

// ---------------------------------------------------------------- the "why" (Phase 6)
const WK = (await db.query(`insert into public.planned_workouts (athlete_id, coach_id, scheduled_date, sport, title, status, why)
  values ('${A1}', '${COACH}', current_date + 1, 'run', 'Tempo', 'approved', 'Builds your threshold for the half.') returning id`)).rows[0].id;
const WKD = (await db.query(`insert into public.planned_workouts (athlete_id, coach_id, scheduled_date, sport, title, status, why)
  values ('${A1}', '${COACH}', current_date + 2, 'run', 'Secret draft', 'draft', 'Not yet') returning id`)).rows[0].id;
await db.exec(`insert into public.workout_why_drafts (workout_id, coach_id, draft, model) values ('${WK}', '${COACH}', 'AI draft text', 'claude-haiku-5-5')`);
r = await as(A1, `select why from public.planned_workouts where id = '${WK}'`);
check("athlete sees the saved why on a sent workout", r.rows?.[0]?.why === "Builds your threshold for the half.");
r = await as(A1, `select why from public.planned_workouts where id = '${WKD}'`);
check("but not on a draft workout", r.rows?.length === 0);
r = await as(A1, `select * from public.workout_why_drafts`);
check("athletes never see AI drafts", r.rows?.length === 0);
r = await as(COACH, `select draft from public.workout_why_drafts where workout_id = '${WK}'`);
check("the coach sees their draft", r.rows?.[0]?.draft === "AI draft text");
r = await as(A1, `update public.planned_workouts set why = 'mine' where id = '${WK}' returning id`);
check("athletes can't change the why", !!r.error || r.rows?.length === 0);
r = await as(COACH, `delete from public.workout_why_drafts where workout_id = '${WK}' returning workout_id`);
check("coach clears the draft", r.rows?.length === 1);
r = await as(COACH, `update public.planned_workouts set why = '${"x".repeat(401)}' where id = '${WK}' returning id`);
check("why stays under 400 characters", !!r.error);
await db.exec(`insert into public.ai_usage (coach_id, model, athletes, input_tokens, output_tokens, cost_usd, trigger) values ('${COACH}', 'claude-haiku-5-5', 1, 1, 1, 0, 'why')`);
check("ai_usage accepts why drafts", true);

// ---------------------------------------------------------------- morning briefs (Phase 7)
const BR = (await db.query(`insert into public.morning_briefs (coach_id, athlete_id, date, draft, model) values ('${COACH}', '${A1}', current_date, 'Nice work yesterday.', 'claude-opus-5-5') returning id`)).rows[0].id;
r = await as(A1, `select * from public.morning_briefs`);
check("athletes never see brief drafts", r.rows?.length === 0);
r = await as(COACH, `select draft from public.morning_briefs where id = '${BR}'`);
check("coach reads their briefs", r.rows?.[0]?.draft === "Nice work yesterday.");
r = await as(A1, `insert into public.morning_briefs (coach_id, athlete_id, date, draft) values ('${COACH}', '${A1}', current_date + 1, 'fake')`);
check("only the server drafts briefs", !!r.error);
await as(A1, `select public.decide_brief('${BR}', 'skipped')`);
check("an athlete can't decide a brief", (await db.query(`select status from public.morning_briefs where id = '${BR}'`)).rows[0].status === "pending");
await as(COACH, `select public.decide_brief('${BR}', 'deleted')`);
check("only sent or skipped", (await db.query(`select status from public.morning_briefs where id = '${BR}'`)).rows[0].status === "pending");
await as(COACH, `select public.decide_brief('${BR}', 'sent', 'Nice work yesterday, edited.', null)`);
const brow = (await db.query(`select status, final_text, decided_at from public.morning_briefs where id = '${BR}'`)).rows[0];
check("coach sends it with their edits", brow.status === "sent" && brow.final_text === "Nice work yesterday, edited." && brow.decided_at !== null);
// The drafter runs server-side with no signed-in user.
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
await db.query(`select public.notify_briefs_ready('${COACH}', 2, current_date)`);
check("the coach is told briefs are ready", (await db.query(`select title from public.notifications where user_id = '${COACH}' and kind = 'briefs_ready'`)).rows[0]?.title === "2 morning briefs are ready");

// ---------------------------------------------------------------- Phase 9a: fueling mode
r = await as(A1, `select mode from public.fuel_settings where athlete_id = '${A1}'`);
check("no fueling row until the coach picks (app defaults to full numbers)", r.rows?.length === 0);
r = await as(A1, `select public.set_fuel_mode('${A1}', 'full') as e`);
check("athlete can't change their own fueling mode", !!r.rows?.[0]?.e);
r = await as(A1, `insert into public.fuel_settings (athlete_id, mode) values ('${A1}', 'full')`);
check("athlete can't write fueling settings directly", !!r.error);
r = await as(STRANGER, `select public.set_fuel_mode('${A1}', 'full') as e`);
check("a stranger can't change someone's fueling mode", !!r.rows?.[0]?.e);
r = await as(COACH, `select public.set_fuel_mode('${A1}', 'workout') as e`);
check("coach sets an athlete's fueling mode", !r.error && r.rows?.[0]?.e === null);
r = await as(COACH, `select public.set_fuel_mode('${A1}', 'bogus') as e`);
check("unknown modes are refused", !!r.rows?.[0]?.e);
r = await as(A1, `select mode from public.fuel_settings where athlete_id = '${A1}'`);
check("athlete reads their mode", r.rows?.[0]?.mode === "workout");
r = await as(A2, `select * from public.fuel_settings`);
check("other athletes can't see it", r.rows?.length === 0);
r = await as(STRANGER, `select * from public.fuel_settings`);
check("strangers can't see it", r.rows?.length === 0);

// ---------------------------------------------------------------- Phase 9b: meal logs and body weight
r = await as(A1, `insert into public.athlete_body (athlete_id, weight_kg) values ('${A1}', 68.5)`);
check("athlete saves their weight", !r.error);
r = await as(A1, `insert into public.athlete_body (athlete_id, weight_kg) values ('${A2}', 70)`);
check("athlete can't set someone else's weight", !!r.error);
r = await as(A1, `update public.athlete_body set weight_kg = 10 where athlete_id = '${A1}'`);
check("silly weights are refused", !!r.error);
r = await as(COACH, `select weight_kg from public.athlete_body where athlete_id = '${A1}'`);
check("coach reads their athlete's weight", Number(r.rows?.[0]?.weight_kg) === 68.5);
r = await as(COACH, `update public.athlete_body set weight_kg = 90 where athlete_id = '${A1}'`);
check("coach can't change the athlete's weight", (await db.query(`select weight_kg from public.athlete_body where athlete_id = '${A1}'`)).rows[0].weight_kg == 68.5);
r = await as(A2, `select * from public.athlete_body`);
check("pod mates and other athletes can't see weight", r.rows?.length === 0);
r = await as(STRANGER, `select * from public.athlete_body`);
check("strangers can't see weight", r.rows?.length === 0);

r = await as(A1, `insert into public.meal_logs (athlete_id, local_date, label, items, carbs_g, protein_g, fat_g) values ('${A1}', current_date, 'Bowl', '[{"name":"rice"}]', 60, 30, 10) returning id, kcal`);
check("athlete logs a meal; kcal is computed", !r.error && Number(r.rows?.[0]?.kcal) === 450);
const MEAL = r.rows?.[0]?.id;
r = await as(A1, `insert into public.meal_logs (athlete_id, local_date, carbs_g) values ('${A2}', current_date, 10)`);
check("athlete can't log for someone else", !!r.error);
r = await as(A1, `insert into public.meal_logs (athlete_id, local_date, kcal) values ('${A1}', current_date, 5)`);
check("kcal can't be typed in", !!r.error);
r = await as(A1, `insert into public.meal_logs (athlete_id, local_date, carbs_g) values ('${A1}', current_date, -5)`);
check("negative amounts are refused", !!r.error);
r = await as(COACH, `select label from public.meal_logs where id = '${MEAL}'`);
check("coach reads their athlete's meals", r.rows?.[0]?.label === "Bowl");
await as(COACH, `delete from public.meal_logs where id = '${MEAL}'`);
check("coach can't delete an athlete's meal", (await db.query(`select count(*)::int as n from public.meal_logs where id = '${MEAL}'`)).rows[0].n === 1);
r = await as(A2, `select * from public.meal_logs`);
check("other athletes can't see meals", r.rows?.length === 0);
r = await as(STRANGER, `select * from public.meal_logs`);
check("strangers can't see meals", r.rows?.length === 0);
await as(A1, `delete from public.meal_logs where id = '${MEAL}'`);
check("athlete removes their own meal", (await db.query(`select count(*)::int as n from public.meal_logs where id = '${MEAL}'`)).rows[0].n === 0);
r = await db.query(`select column_default from information_schema.columns where table_name = 'fuel_settings' and column_name = 'mode'`);
check("new fueling rows default to full numbers", String(r.rows[0]?.column_default).includes("full"));

// ---------------------------------------------------------------- Phase 9c: private safety notes
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const SN = (await db.query(`insert into public.safety_notes (coach_id, athlete_id, created_on, updated_on, signals, signal_count, summary) values ('${COACH}', '${A1}', current_date, current_date, '{}', 2, 'Logged intake about 60% of target') returning id`)).rows[0].id;
await db.query(`select public.notify_safety_note('${SN}')`);
check("the coach gets a private bell note", (await db.query(`select title from public.notifications where user_id = '${COACH}' and kind = 'safety_note'`)).rows[0]?.title?.startsWith("A private fueling note about"));
check("the athlete gets no notification about it", (await db.query(`select count(*)::int as n from public.notifications where user_id = '${A1}' and kind = 'safety_note'`)).rows[0].n === 0);
r = await as(A1, `select * from public.safety_notes`);
check("the athlete can never read notes about them", r.rows?.length === 0);
r = await as(A2, `select * from public.safety_notes`);
check("other athletes and pod mates can't read them", r.rows?.length === 0);
r = await as(STRANGER, `select * from public.safety_notes`);
check("strangers can't read them", r.rows?.length === 0);
r = await as(COACH, `select summary from public.safety_notes where id = '${SN}'`);
check("their coach reads the note", r.rows?.[0]?.summary === "Logged intake about 60% of target");
r = await as(COACH, `insert into public.safety_notes (coach_id, athlete_id, created_on, updated_on, signals, signal_count, summary) values ('${COACH}', '${A1}', current_date + 1, current_date + 1, '{}', 2, 'x')`);
check("only the morning job writes notes", !!r.error);
r = await as(A1, `select public.decide_safety_note('${SN}', 'dismissed') as e`);
check("the athlete can't dismiss a note", !!r.rows?.[0]?.e);
r = await as(STRANGER, `select public.decide_safety_note('${SN}', 'dismissed') as e`);
check("a stranger can't dismiss a note", !!r.rows?.[0]?.e);
r = await as(COACH, `select public.decide_safety_note('${SN}', 'deleted') as e`);
check("only talked or dismissed", !!r.rows?.[0]?.e);
r = await as(COACH, `select public.decide_safety_note('${SN}', 'talked') as e`);
const snrow = (await db.query(`select status, decided_at from public.safety_notes where id = '${SN}'`)).rows[0];
check("coach marks it talked about", r.rows?.[0]?.e === null && snrow.status === "talked" && snrow.decided_at !== null);
r = await as(A1, `select public.notify_safety_note('${SN}')`);
check("signed-in users can't send safety notifications", !!r.error);

// ---------------------------------------------------------------- push notifications
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
await db.query(`delete from net.pings`);
await as(A1, `select public.register_push_token('${"a".repeat(64)}', 'ios', 'sandbox', '0.1')`);
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
await db.query(`select private.notify('${A1}', 'message', 'New message', 'hi', '/messages', 'push-test', '{}'::jsonb, '${A2}')`);
let pings = (await db.query(`select body from net.pings`)).rows;
check("a new notification pings the push server with only its id", pings.length === 1 && Object.keys(pings[0].body).join() === "id");
await db.query(`select private.notify('${A1}', 'message', 'New message', 'hi again', '/messages', 'push-test', '{}'::jsonb, '${A2}')`);
check("a folded repeat (same row refreshed) pings again", (await db.query(`select count(*)::int as n from net.pings`)).rows[0].n === 2);
await db.query(`select private.notify('${A2}', 'message', 'New message', 'hi', '/messages', null, '{}'::jsonb, '${A1}')`);
check("no ping for someone without the app", (await db.query(`select count(*)::int as n from net.pings`)).rows[0].n === 2);
r = await as(A1, `select public.set_push_sound('messages', 'heartbeat') as e`);
check("set a push sound", r.rows?.[0]?.e === null);
r = await as(A1, `select public.set_push_sound('messages', 'airhorn') as e`);
check("unknown sounds are refused", !!r.rows?.[0]?.e);
r = await as(A1, `select public.set_push_sound('everything', 'pop') as e`);
check("unknown groups are refused", !!r.rows?.[0]?.e);
r = await as(A1, `select public.set_push_sound('coach', 'quack') as e`);
check("set the from-your-coach sound", r.rows?.[0]?.e === null);
check("sound saved on the profile", (await db.query(`select push_sounds from public.profiles where id = '${A1}'`)).rows[0].push_sounds.messages === "heartbeat");

r = await as(A1, `select public.set_push_sound('pods', 'walker') as e`);
check("the recorded Walker sound can be picked", r.rows?.[0]?.e === null);

// Welcome tour
await as(A1, `select public.mark_welcomed()`);
check("finishing the welcome tour is remembered", !!(await db.query(`select welcomed_at from public.profiles where id = '${A1}'`)).rows[0].welcomed_at);
check("it only marks your own profile", !(await db.query(`select welcomed_at from public.profiles where id = '${A2}'`)).rows[0].welcomed_at);

// Apple Watch: the iPhone app confirms what it scheduled or removed, for the signed-in athlete only.
const AW = (await db.query(`insert into public.planned_workouts (athlete_id, coach_id, scheduled_date, sport, title, status, approved_at) values ('${A1}', '${COACH}', '2026-12-01', 'run', 'Apple run', 'approved', now()) returning id`)).rows[0].id;
const AW2 = (await db.query(`insert into public.planned_workouts (athlete_id, coach_id, scheduled_date, sport, title, status, approved_at) values ('${A2}', '${COACH}', '2026-12-01', 'run', 'Not yours', 'approved', now()) returning id`)).rows[0].id;
const AWD = (await db.query(`insert into public.planned_workouts (athlete_id, coach_id, scheduled_date, sport, title, status, approved_at, deleted_at, removal_status) values ('${A1}', '${COACH}', '2026-12-02', 'run', 'Removed', 'sent', now(), now(), 'pending_sync') returning id`)).rows[0].id;
r = await as(A1, `select public.apple_ack_workouts(array['${AW}', '${AW2}']::uuid[], array['${AWD}']::uuid[])`);
check("apple ack runs", !r.error);
const aw = (await db.query(`select id, status, external_id, removal_status from public.planned_workouts where id in ('${AW}', '${AW2}', '${AWD}')`)).rows;
check("acked workout is marked on the watch", aw.find((x) => x.id === AW)?.status === "sent" && aw.find((x) => x.id === AW)?.external_id === `apple:${AW}`);
check("another athlete's workout is untouched", aw.find((x) => x.id === AW2)?.status === "approved");
check("acked removal is confirmed", aw.find((x) => x.id === AWD)?.removal_status === "removed");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

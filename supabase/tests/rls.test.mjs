import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";

const db = new PGlite();
const migration = readdirSync(new URL("../migrations/", import.meta.url)).sort()
  .map((f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8")).join("\n");

// Minimal stand-in for Supabase's auth schema and roles.
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to authenticated;
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
check("after both accept, A1 sees A2's wellness", a2?.wellness?.length >= 1);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

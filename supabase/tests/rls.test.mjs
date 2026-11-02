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
await db.exec(`select public.save_garmin_tokens('${A1}', 'acc', 'ref', now() + interval '1 day')`);
const tok = (await db.query(`select * from public.get_garmin_tokens('${A1}')`)).rows;
check("server can save and read tokens", tok[0]?.access_token === "acc");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

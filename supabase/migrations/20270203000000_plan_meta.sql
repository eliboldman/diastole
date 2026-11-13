-- Imported training plans (scripts/import-pcb-plan.ts): each planned workout that came from a plan
-- file keeps the plan's own data in plan_meta:
--   { plan_id, session_id, week, phase, category, is_key, test, fueling, location, ...,  -- the session's "plan" object
--     steps_rel,            -- the raw steps with their "rel" targets (source of truth when zones change)
--     brick: { session_id, plan, steps_rel } | null,  -- the run half of a brick merged into this bike row
--     import_hash, imported_at }  -- what the import wrote, to tell "edited since import" apart
-- One row per session_id per athlete, including soft-deleted rows (a deleted session is not re-created).

alter table public.planned_workouts add column plan_meta jsonb;

create unique index planned_workouts_plan_session
  on public.planned_workouts (athlete_id, (plan_meta ->> 'session_id'))
  where plan_meta is not null;
create index planned_workouts_plan_id
  on public.planned_workouts (athlete_id, (plan_meta ->> 'plan_id'))
  where plan_meta is not null;

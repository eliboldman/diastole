-- Phase 3: strength training.
--  * strength jsonb on planned workouts, library items and plan sessions (sport = 'strength'):
--    [{"slug": "back-squat", "sets": 3, "reps": 5, "seconds": null, "kg": 60, "tempo": "3-1-1", "rest_s": 120, "note": ""}]
--  * strength_logs: what the athlete actually did, set by set, with session RPE. Each log also
--    becomes an activity (source 'diastole') so it counts toward the week, load and muscle map.
--  * strength_rules: the progression rules the coach approved for an athlete.
--  * strength_suggestions: next loads worked out after a session, waiting for the coach (or applied
--    automatically when the coach turned that on).

alter type public.data_source add value if not exists 'diastole';

alter table public.planned_workouts add column strength jsonb;
alter table public.workout_library add column strength jsonb;
alter table public.plan_template_workouts add column strength jsonb;
alter table public.plan_template_workouts drop constraint plan_template_workouts_sport_check;
alter table public.plan_template_workouts add constraint plan_template_workouts_sport_check check (sport in ('run', 'bike', 'swim', 'strength'));

create table public.strength_logs (
  id                  uuid primary key default gen_random_uuid(),
  athlete_id          uuid not null references public.profiles (id) on delete cascade,
  planned_workout_id  uuid references public.planned_workouts (id) on delete set null,
  activity_id         uuid references public.activities (id) on delete set null,
  date                date not null,
  items               jsonb not null default '[]', -- [{"slug": "...", "sets": [{"reps": 5, "kg": 60, "seconds": null}]}]
  rpe                 integer check (rpe between 1 and 10),
  duration_s          integer check (duration_s is null or duration_s between 0 and 21600),
  note                text check (note is null or length(note) <= 500),
  created_at          timestamptz not null default now()
);
create index strength_logs_athlete on public.strength_logs (athlete_id, date desc);
alter table public.strength_logs enable row level security;
create policy "strength_logs: athlete or coach reads" on public.strength_logs for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select on public.strength_logs to authenticated;

create table public.strength_rules (
  athlete_id   uuid primary key references public.profiles (id) on delete cascade,
  rules        jsonb not null default '{}', -- {"upper_kg": 2.5, "lower_kg": 5, "easy_rpe": 7, "drop_pct": 10}
  auto         boolean not null default false, -- apply progressions without asking
  approved_at  timestamptz not null default now()
);
alter table public.strength_rules enable row level security;
create policy "strength_rules: coach manages, athlete reads" on public.strength_rules for all to authenticated
  using (public.is_coach_of(athlete_id) or athlete_id = auth.uid())
  with check (public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.strength_rules to authenticated;

create table public.strength_suggestions (
  id                  uuid primary key default gen_random_uuid(),
  athlete_id          uuid not null references public.profiles (id) on delete cascade,
  log_id              uuid references public.strength_logs (id) on delete cascade,
  planned_workout_id  uuid references public.planned_workouts (id) on delete cascade, -- the session it would change
  changes             jsonb not null, -- [{"slug": "...", "from": {"kg": 60, "reps": 5}, "to": {"kg": 62.5, "reps": 5}, "why": "..."}]
  status              text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  created_at          timestamptz not null default now()
);
create index strength_suggestions_athlete on public.strength_suggestions (athlete_id, status);
alter table public.strength_suggestions enable row level security;
create policy "strength_suggestions: coach manages" on public.strength_suggestions for all to authenticated
  using (public.is_coach_of(athlete_id)) with check (public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.strength_suggestions to authenticated;

-- Workout management: soft delete with device removal status, a per-coach workout library,
-- and version history for planned workouts.

-- ---------------------------------------------------------------- library
create table public.workout_library (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.profiles (id) on delete cascade,
  title         text not null,
  sport         text not null,
  workout_type  text not null default 'other'
                  check (workout_type in ('easy', 'long', 'tempo', 'threshold', 'intervals', 'recovery', 'race', 'other')),
  tags          text[] not null default '{}',
  description   text,
  steps         jsonb not null default '[]',
  -- The builder workout this entry was saved from; edits to that draft keep the entry in sync.
  source_workout_id uuid,
  use_count     int not null default 0,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index workout_library_coach on public.workout_library (coach_id, updated_at desc);
create trigger workout_library_touch before update on public.workout_library
  for each row execute function public.touch_updated_at();

alter table public.workout_library enable row level security;
create policy "library: coach manages own" on public.workout_library for all to authenticated
  using (coach_id = auth.uid() and public.is_coach())
  with check (coach_id = auth.uid() and public.is_coach());

-- ---------------------------------------------------------------- planned_workouts additions
alter table public.planned_workouts
  add column library_id          uuid references public.workout_library (id) on delete set null,
  add column garmin_schedule_id  text,
  add column deleted_at          timestamptz,
  -- After a delete: 'pending_sync' = removed on our side / Garmin, waiting for the device to sync;
  -- 'removed' = the device confirmed (Apple app acks); 'failed' = device removal errored (retryable).
  add column removal_status      text check (removal_status in ('pending_sync', 'removed', 'failed')),
  add column removal_error       text;
create index planned_workouts_deleted on public.planned_workouts (coach_id, deleted_at) where deleted_at is not null;

-- Athletes never see deleted workouts.
drop policy "workouts: athlete reads" on public.planned_workouts;
create policy "workouts: athlete reads" on public.planned_workouts for select to authenticated
  using (athlete_id = auth.uid() and status <> 'draft' and deleted_at is null);

-- ---------------------------------------------------------------- version history
create table public.workout_versions (
  id              uuid primary key default gen_random_uuid(),
  workout_id      uuid not null references public.planned_workouts (id) on delete cascade,
  version         int not null,
  change          text not null,             -- 'created', 'edited', 'harder 5% (intensity)', 'rescheduled', ...
  title           text not null,
  sport           text not null,
  scheduled_date  date not null,
  description     text,
  steps           jsonb not null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (workout_id, version)
);

alter table public.workout_versions enable row level security;
create policy "versions: coach reads" on public.workout_versions for select to authenticated
  using (exists (select 1 from public.planned_workouts w where w.id = workout_id and w.coach_id = auth.uid()));
create policy "versions: coach writes" on public.workout_versions for insert to authenticated
  with check (exists (select 1 from public.planned_workouts w where w.id = workout_id and w.coach_id = auth.uid()));

-- Existing workouts start their history at version 1.
insert into public.workout_versions (workout_id, version, change, title, sport, scheduled_date, description, steps, created_by, created_at)
select id, 1, 'created', title, sport, scheduled_date, description, steps, coach_id, created_at
from public.planned_workouts;

-- Athletes build their own workouts: a private library each, and requests that wait for the coach.

-- ---------------------------------------------------------------- the athlete's library
create table public.athlete_library (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (length(trim(title)) between 1 and 100),
  sport        text not null check (sport in ('run', 'bike', 'swim')),
  description  text check (description is null or length(description) <= 1024),
  steps        jsonb not null default '[]' check (jsonb_typeof(steps) = 'array' and length(steps::text) < 60000),
  pool_length  numeric check (pool_length is null or pool_length between 10 and 100),
  pool_unit    text check (pool_unit is null or pool_unit in ('METER', 'YARD')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index athlete_library_athlete on public.athlete_library (athlete_id, updated_at desc);
create trigger athlete_library_touch before update on public.athlete_library
  for each row execute function public.touch_updated_at();
alter table public.athlete_library enable row level security;
create policy "athlete library: own" on public.athlete_library for all to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy "athlete library: coach reads" on public.athlete_library for select to authenticated
  using (public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.athlete_library to authenticated;

-- ---------------------------------------------------------------- requests
-- An athlete's "ask my coach to add this" is a draft on the coach's side with requested_by set.
-- The coach approves it (it's sent like any workout) or declines it (declined_at). Written by
-- server actions with the service role after checks. Athletes never read drafts (their calendar
-- and watch sync stay as they are); the My workouts page reads their requests on the server.
-- A declined request is also soft-deleted so it drops out of the coach's lists.
alter table public.planned_workouts
  add column requested_by uuid references public.profiles (id) on delete set null,
  add column declined_at  timestamptz;
create index planned_workouts_requests on public.planned_workouts (coach_id) where requested_by is not null and status = 'draft' and declined_at is null;

-- ---------------------------------------------------------------- notifications
-- workout_request: an athlete asked (coach, coaching). workout_declined: the coach said no (athlete).
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated', 'weekly_digest', 'workout_pack', 'workout_shoes', 'pod_challenge', 'workout_recap', 'monthly_digest',
  'workout_request', 'workout_declined'));

create or replace function private.notify_group(p_kind text, p_meta jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_kind = 'pod_props' and coalesce((p_meta ->> 'comment')::boolean, false) then 'comments'
    when p_kind = 'pod_props' then 'props'
    when p_kind = 'message' then 'messages'
    when p_kind in ('pod_invite', 'pod_answer', 'pod_challenge') then 'pods'
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined', 'checkin_pain', 'briefs_ready', 'safety_note', 'zones_updated', 'weekly_digest', 'monthly_digest', 'workout_request') then 'coaching'
    when p_kind like 'workout\_%' then 'workouts'
    else null end;
$$;

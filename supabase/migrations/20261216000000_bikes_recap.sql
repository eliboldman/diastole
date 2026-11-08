-- Which bike a ride was on, and monthly recap notifications.

-- ---------------------------------------------------------------- bike mileage
-- Bike ids live in athlete_gear.gear.bikes. With one bike, untagged outdoor rides count toward it.
create table public.activity_bikes (
  activity_id  uuid primary key references public.activities (id) on delete cascade,
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  bike_id      text not null check (bike_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  created_at   timestamptz not null default now()
);
create index activity_bikes_athlete on public.activity_bikes (athlete_id);
alter table public.activity_bikes enable row level security;
create policy "activity_bikes: athlete or coach" on public.activity_bikes for all to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
  with check (
    (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
    and exists (select 1 from public.activities a where a.id = activity_id and a.athlete_id = activity_bikes.athlete_id)
  );
grant select, insert, update, delete on public.activity_bikes to authenticated;

-- ---------------------------------------------------------------- notifications
-- workout_recap: an athlete's month (grouped with workouts by its prefix).
-- monthly_digest: the coach's team month (coaching).
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated', 'weekly_digest', 'workout_pack', 'workout_shoes', 'pod_challenge', 'workout_recap', 'monthly_digest'));

create or replace function private.notify_group(p_kind text, p_meta jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_kind = 'pod_props' and coalesce((p_meta ->> 'comment')::boolean, false) then 'comments'
    when p_kind = 'pod_props' then 'props'
    when p_kind = 'message' then 'messages'
    when p_kind in ('pod_invite', 'pod_answer', 'pod_challenge') then 'pods'
    when p_kind like 'workout\_%' then 'workouts'
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined', 'checkin_pain', 'briefs_ready', 'safety_note', 'zones_updated', 'weekly_digest', 'monthly_digest') then 'coaching'
    else null end;
$$;

-- ---------------------------------------------------------------- AI usage
-- swap: "Change of plans" (the coach says what they're doing instead).
alter table public.ai_usage drop constraint ai_usage_trigger_check;
alter table public.ai_usage add constraint ai_usage_trigger_check check (trigger in ('cron', 'manual', 'test', 'form', 'why', 'brief', 'build', 'meal', 'plan', 'swap'));

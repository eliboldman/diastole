-- Phase 2: training windows and bedtime coaching.
--  * planned_workouts.start_time: when the session is planned (athlete's local time). Defaults to
--    the athlete's training window for that day; the coach can change it.
--  * daily_wellness.sleep_start: when the night's sleep began (from Garmin or Apple Health), for
--    bedtime consistency.
--  * athlete_sleep: wake time, sleep goal, prep/travel buffer, evening nudges and quiet hours,
--    optional wind-down routine. Training windows live in athlete_week.days (per weekday).
--  * notification kind bedtime_recap (weekly morning follow-up) in its own 'sleep' group.

alter table public.planned_workouts add column start_time time;
alter table public.daily_wellness add column sleep_start timestamptz;

create table public.athlete_sleep (
  athlete_id      uuid primary key references public.profiles (id) on delete cascade,
  wake_time       time,
  sleep_goal_min  integer check (sleep_goal_min is null or sleep_goal_min between 300 and 720),
  buffer_min      integer not null default 45 check (buffer_min between 0 and 180),
  nudges          boolean not null default true,
  quiet_start     time not null default '22:30',
  quiet_end       time not null default '06:00',
  wind_down       text check (wind_down is null or length(wind_down) <= 80), -- a recovery routine key
  updated_at      timestamptz not null default now()
);
alter table public.athlete_sleep enable row level security;
create policy "athlete_sleep: athlete or coach" on public.athlete_sleep for all to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
  with check (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.athlete_sleep to authenticated;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated', 'weekly_digest', 'workout_pack', 'workout_shoes', 'pod_challenge', 'workout_recap', 'monthly_digest',
  'workout_request', 'workout_declined', 'workout_recovery', 'plan_change', 'workout_changed',
  'zone_suggestion', 'session_missed', 'bedtime_recap'));

create or replace function private.notify_group(p_kind text, p_meta jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_kind = 'pod_props' and coalesce((p_meta ->> 'comment')::boolean, false) then 'comments'
    when p_kind = 'pod_props' then 'props'
    when p_kind = 'message' then 'messages'
    when p_kind in ('pod_invite', 'pod_answer', 'pod_challenge') then 'pods'
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined', 'checkin_pain', 'briefs_ready', 'safety_note', 'zones_updated', 'weekly_digest', 'monthly_digest', 'workout_request', 'plan_change', 'zone_suggestion', 'session_missed') then 'coaching'
    when p_kind = 'bedtime_recap' then 'sleep'
    when p_kind like 'workout\_%' then 'workouts'
    else null end;
$$;

create or replace function public.set_notify_prefs(p_prefs jsonb)
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles
     set notify_prefs = (
       select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(p_prefs)
       where key in ('props', 'comments', 'messages', 'pods', 'workouts', 'coaching', 'sleep') and jsonb_typeof(value) = 'boolean')
   where id = auth.uid();
$$;
revoke all on function public.set_notify_prefs(jsonb) from public, anon;
grant execute on function public.set_notify_prefs(jsonb) to authenticated;

create or replace function public.set_push_sound(p_group text, p_sound text)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return 'Sign in first.'; end if;
  if p_group not in ('coach', 'props', 'comments', 'messages', 'pods', 'workouts', 'coaching', 'sleep') then return 'Unknown group.'; end if;
  if p_sound not in ('quack', 'walker', 'heartbeat', 'chime', 'pop', 'tone', 'tick', 'default', 'none') then return 'Unknown sound.'; end if;
  update public.profiles set push_sounds = push_sounds || jsonb_build_object(p_group, p_sound) where id = auth.uid();
  return null;
end;
$$;

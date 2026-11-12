-- Post-workout protein nudge: about 30 minutes after a workout reaches Diastole, the athlete gets a
-- light-hearted line about it plus "about 30 g of protein in the next 30 minutes". Nothing is sent
-- when they've already logged a meal with protein since finishing. Athletes can turn it off
-- (Settings -> Notifications -> Post-workout protein reminder).
--
-- A pg_cron job pings the server every 5 minutes; the server finds workouts that are due and
-- decides. The ping carries nothing, and each workout is claimed once in refuel_nudges, so a
-- repeated or forged ping can't send anything extra.

-- One row per workout considered: sent, or quiet because protein was already logged.
create table public.refuel_nudges (
  activity_id uuid primary key references public.activities (id) on delete cascade,
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  outcome     text not null check (outcome in ('sent', 'ate')),
  created_at  timestamptz not null default now()
);
create index refuel_nudges_athlete on public.refuel_nudges (athlete_id, created_at desc);
alter table public.refuel_nudges enable row level security; -- server only (no policies)

-- Finds due workouts quickly (recent uploads).
create index if not exists activities_created on public.activities (created_at desc);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated', 'weekly_digest', 'workout_pack', 'workout_shoes', 'pod_challenge', 'workout_recap', 'monthly_digest',
  'workout_request', 'workout_declined', 'workout_recovery', 'plan_change', 'workout_changed',
  'zone_suggestion', 'session_missed', 'bedtime_recap', 'swim_video',
  'boss_suggested', 'boss', 'baton', 'campfire', 'storyline', 'poster', 'refuel'));

-- New notification group 'fuel' (kept in step with lib/push/sounds.ts groupOf).
create or replace function private.notify_group(p_kind text, p_meta jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_kind = 'pod_props' and coalesce((p_meta ->> 'comment')::boolean, false) then 'comments'
    when p_kind = 'pod_props' then 'props'
    when p_kind = 'message' then 'messages'
    when p_kind in ('pod_invite', 'pod_answer', 'pod_challenge', 'baton', 'campfire', 'storyline') then 'pods'
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined', 'checkin_pain', 'briefs_ready', 'safety_note', 'zones_updated', 'weekly_digest', 'monthly_digest', 'workout_request', 'plan_change', 'zone_suggestion', 'session_missed', 'boss_suggested') then 'coaching'
    when p_kind = 'bedtime_recap' then 'sleep'
    when p_kind = 'refuel' then 'fuel'
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
       where key in ('props', 'comments', 'messages', 'pods', 'workouts', 'coaching', 'sleep', 'fuel') and jsonb_typeof(value) = 'boolean')
   where id = auth.uid();
$$;

create or replace function public.set_push_sound(p_group text, p_sound text)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return 'Sign in first.'; end if;
  if p_group not in ('coach', 'props', 'comments', 'messages', 'pods', 'workouts', 'coaching', 'sleep', 'fuel') then return 'Unknown group.'; end if;
  if p_sound not in ('quack', 'walker', 'heartbeat', 'chime', 'pop', 'tone', 'tick', 'default', 'none') then return 'Unknown sound.'; end if;
  update public.profiles set push_sounds = push_sounds || jsonb_build_object(p_group, p_sound) where id = auth.uid();
  return null;
end;
$$;

-- Server-only: the bell notification (and push) for one workout. Respects the 'fuel' setting and test accounts.
create or replace function public.notify_refuel(p_athlete uuid, p_activity uuid, p_title text, p_body text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.notify(p_athlete, 'refuel', p_title, p_body, '/fuel', 'refuel:' || p_activity,
    jsonb_build_object('activity', p_activity), null);
end;
$$;
revoke all on function public.notify_refuel(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.notify_refuel(uuid, uuid, text, text) to service_role;

-- Every 5 minutes: ask the server to send any nudges that are due.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'refuel-nudges',
  '*/5 * * * *',
  $cron$select net.http_post(url := 'https://diastole.app/api/cron/refuel', body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb)$cron$
);

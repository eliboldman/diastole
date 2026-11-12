-- Dietitian workout alerts: at the same moment the athlete's protein nudge is decided (about 30
-- minutes after a workout reaches Diastole), each dietitian who can see that athlete gets a bell
-- notification (and push) with the workout and whether protein has been logged since. Dietitians
-- can turn it off with the same 'fuel' setting.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated', 'weekly_digest', 'workout_pack', 'workout_shoes', 'pod_challenge', 'workout_recap', 'monthly_digest',
  'workout_request', 'workout_declined', 'workout_recovery', 'plan_change', 'workout_changed',
  'zone_suggestion', 'session_missed', 'bedtime_recap', 'swim_video',
  'boss_suggested', 'boss', 'baton', 'campfire', 'storyline', 'poster', 'refuel', 'refuel_staff'));

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
    when p_kind in ('refuel', 'refuel_staff') then 'fuel'
    when p_kind like 'workout\_%' then 'workouts'
    else null end;
$$;

-- 'quiet': the athlete has their own reminder turned off, but their dietitians still hear about the workout.
alter table public.refuel_nudges drop constraint refuel_nudges_outcome_check;
alter table public.refuel_nudges add constraint refuel_nudges_outcome_check check (outcome in ('sent', 'ate', 'quiet'));

-- Server-only: one alert per dietitian who can see this athlete (all athletes, or picked). Returns how many.
create or replace function public.notify_refuel_staff(p_athlete uuid, p_activity uuid, p_title text, p_body text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare d record; n integer := 0;
begin
  for d in
    select dt.id from public.profiles a
    join public.profiles dt on dt.role = 'dietitian' and dt.team_coach_id = a.coach_id
    where a.id = p_athlete and a.coach_id is not null
      and (dt.dietitian_all or exists (select 1 from public.dietitian_athletes x where x.dietitian_id = dt.id and x.athlete_id = p_athlete))
  loop
    perform private.notify(d.id, 'refuel_staff', p_title, p_body, '/nutrition/' || p_athlete || '#refuel',
      'refuel_staff:' || p_activity, jsonb_build_object('activity', p_activity, 'athlete', p_athlete), p_athlete);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.notify_refuel_staff(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.notify_refuel_staff(uuid, uuid, text, text) to service_role;

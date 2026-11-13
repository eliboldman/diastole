-- Sync self-repair: when a watch stops sending data (48 h+, or never after connecting), the
-- athlete gets a "reconnect" notice and their coach a heads-up, once per quiet spell (the dedupe
-- key carries the last sync time, so a new spell after data resumes notifies again).

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated', 'weekly_digest', 'workout_pack', 'workout_shoes', 'pod_challenge', 'workout_recap', 'monthly_digest',
  'workout_request', 'workout_declined', 'workout_recovery', 'plan_change', 'workout_changed',
  'zone_suggestion', 'session_missed', 'bedtime_recap', 'swim_video',
  'boss_suggested', 'boss', 'baton', 'campfire', 'storyline', 'poster', 'refuel', 'refuel_staff',
  'device_stale', 'device_stale_coach'));

create or replace function private.notify_group(p_kind text, p_meta jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_kind = 'pod_props' and coalesce((p_meta ->> 'comment')::boolean, false) then 'comments'
    when p_kind = 'pod_props' then 'props'
    when p_kind = 'message' then 'messages'
    when p_kind in ('pod_invite', 'pod_answer', 'pod_challenge', 'baton', 'campfire', 'storyline') then 'pods'
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined', 'checkin_pain', 'briefs_ready', 'safety_note', 'zones_updated', 'weekly_digest', 'monthly_digest', 'workout_request', 'plan_change', 'zone_suggestion', 'session_missed', 'boss_suggested', 'device_stale_coach') then 'coaching'
    when p_kind = 'bedtime_recap' then 'sleep'
    when p_kind in ('refuel', 'refuel_staff') then 'fuel'
    when p_kind like 'workout\_%' then 'workouts'
    else null end;
$$;

-- Morning job (service role). Returns how many athletes were flagged.
create or replace function public.notify_stale_devices()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  n int := 0;
  days int;
  key text;
  label text;
begin
  for r in
    select d.athlete_id, d.source, d.connected_at, d.last_synced_at, p.coach_id, p.full_name
    from public.device_connections d join public.profiles p on p.id = d.athlete_id
    where not p.is_test and not p.is_demo
      and coalesce(d.last_synced_at, d.connected_at) < now() - interval '48 hours'
  loop
    days := greatest(2, floor(extract(epoch from now() - coalesce(r.last_synced_at, r.connected_at)) / 86400)::int);
    key := 'stale:' || r.athlete_id || ':' || coalesce(r.last_synced_at::text, 'never');
    label := case when r.source = 'garmin' then 'Garmin' else 'Apple Watch' end;
    perform private.notify(r.athlete_id, 'device_stale',
      case when r.source = 'garmin' then 'Your Garmin stopped syncing' else 'Open Diastole to sync your watch' end,
      case when r.source = 'garmin'
        then 'No data from Garmin in ' || days || ' days. Tap to reconnect: it takes 20 seconds.'
        else 'Your iPhone hasn''t sent Apple Watch data in ' || days || ' days. Open the app to sync.' end,
      '/connect?repair=1', key, '{}'::jsonb, null);
    if r.coach_id is not null and r.coach_id <> r.athlete_id then
      perform private.notify(r.coach_id, 'device_stale_coach',
        coalesce(split_part(nullif(btrim(r.full_name), ''), ' ', 1), 'An athlete') || '''s ' || label || ' isn''t syncing',
        case when r.last_synced_at is null then 'Connected ' || days || ' days ago, no data yet.' else 'No data in ' || days || ' days.' end
          || ' They''ve been sent a reconnect link.',
        '/athlete/' || r.athlete_id, key, '{}'::jsonb, null);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.notify_stale_devices() from public, anon, authenticated;
grant execute on function public.notify_stale_devices() to service_role;

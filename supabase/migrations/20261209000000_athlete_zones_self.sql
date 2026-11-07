-- Athletes can enter their own numbers (FTP, threshold pace, threshold and max heart rate).
-- Their coach can still change them, and gets a bell notification whenever an athlete does.
-- zone_history keeps every value either way.

drop policy "athlete_zones: coach insert" on public.athlete_zones;
drop policy "athlete_zones: coach update" on public.athlete_zones;
create policy "athlete_zones: insert" on public.athlete_zones for insert to authenticated
  with check (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
create policy "athlete_zones: update" on public.athlete_zones for update to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
  with check (athlete_id = auth.uid() or public.is_coach_of(athlete_id));

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated'));

create or replace function private.notify_group(p_kind text, p_meta jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_kind = 'pod_props' and coalesce((p_meta ->> 'comment')::boolean, false) then 'comments'
    when p_kind = 'pod_props' then 'props'
    when p_kind = 'message' then 'messages'
    when p_kind in ('pod_invite', 'pod_answer') then 'pods'
    when p_kind like 'workout\_%' then 'workouts'
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined', 'checkin_pain', 'briefs_ready', 'safety_note', 'zones_updated') then 'coaching'
    else null end;
$$;

-- When an athlete changes their own numbers, tell their coach what changed.
create or replace function private.notify_zones_self()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  coach uuid;
  who text;
  parts text[] := '{}';
  was public.athlete_zones;
begin
  if auth.uid() is null or new.athlete_id <> auth.uid() then return new; end if;
  select coach_id into coach from public.profiles where id = new.athlete_id;
  if coach is null or coach = new.athlete_id then return new; end if;
  if tg_op = 'UPDATE' then was := old; end if;

  if new.ftp_w is distinct from was.ftp_w then
    parts := parts || ('FTP ' || coalesce(was.ftp_w::text || ' → ', '') || coalesce(new.ftp_w::text || ' W', 'cleared'));
  end if;
  if new.threshold_speed_mps is distinct from was.threshold_speed_mps then
    parts := parts || ('threshold pace ' || case when new.threshold_speed_mps is null then 'cleared' else 'updated' end);
  end if;
  if new.threshold_hr is distinct from was.threshold_hr then
    parts := parts || ('threshold HR ' || coalesce(was.threshold_hr::text || ' → ', '') || coalesce(new.threshold_hr::text, 'cleared'));
  end if;
  if new.max_hr is distinct from was.max_hr then
    parts := parts || ('max HR ' || coalesce(was.max_hr::text || ' → ', '') || coalesce(new.max_hr::text, 'cleared'));
  end if;
  if cardinality(parts) = 0 then return new; end if;

  select coalesce(nullif(split_part(full_name, ' ', 1), ''), 'An athlete') into who from public.profiles where id = new.athlete_id;
  perform private.notify(coach, 'zones_updated', who || ' updated their numbers',
    upper(left(array_to_string(parts, ', '), 1)) || substr(array_to_string(parts, ', '), 2),
    '/athlete/' || new.athlete_id || '#zones', 'zones:' || new.athlete_id);
  return new;
end;
$$;
create trigger notify_zones_self after insert or update on public.athlete_zones
  for each row execute function private.notify_zones_self();

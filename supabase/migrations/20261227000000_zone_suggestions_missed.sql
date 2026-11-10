-- Zone update suggestions and missed-session alerts (rules only, no AI).
--  * athlete_zones.dismissed: what the coach turned down, per zone ({"ftp_w": 285, ...}); a zone is
--    only suggested again when a higher estimate shows up.
--  * notification kinds: zone_suggestion (a recent effort says a zone is out of date) and
--    session_missed (a key session was skipped, cut short, or mostly off target), both 'coaching'.

alter table public.athlete_zones add column dismissed jsonb not null default '{}'::jsonb;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated', 'weekly_digest', 'workout_pack', 'workout_shoes', 'pod_challenge', 'workout_recap', 'monthly_digest',
  'workout_request', 'workout_declined', 'workout_recovery', 'plan_change', 'workout_changed',
  'zone_suggestion', 'session_missed'));

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
    when p_kind like 'workout\_%' then 'workouts'
    else null end;
$$;

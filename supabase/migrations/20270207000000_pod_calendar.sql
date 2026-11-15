-- Pod calendars (Eli, 2026-11-15): pod mates see each other's training week (what's planned and
-- what's done) to keep each other accountable. On by default; each athlete can turn it off.
--
-- Separate from pod_share_level: an athlete at "avatar and name" still shares their calendar unless
-- they switch it off. Shared per session: date, sport, title, planned minutes, done or not.
-- Never shared: descriptions, steps and targets, coach notes ("why"), drafts, deleted or skipped
-- sessions. A sealed mystery workout shows as "Mystery workout" until it is revealed.

alter table public.profiles add column pod_share_calendar boolean not null default true;

-- pod_can_see gains 'calendar' (the rest is unchanged from 20261123000000_pod_profiles).
create or replace function public.pod_can_see(p_owner uuid, p_what text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_owner = auth.uid()
    or public.is_coach_of(p_owner)
    or (
      public.shares_pod_with(p_owner)
      and coalesce((
        select case p_what
          when 'avatar' then true
          when 'readiness' then p.pod_share_level >= 1
          when 'training' then p.pod_share_level >= 2
          when 'calendar' then p.pod_share_calendar
          when 'hrv' then p.pod_share_hrv
          when 'sleep' then p.pod_share_sleep
          when 'stress' then p.pod_share_stress
          else false end
        from public.profiles p where p.id = p_owner), false)
    );
$$;

create or replace function public.set_pod_calendar(p_share boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles set pod_share_calendar = coalesce(p_share, true) where id = auth.uid();
$$;
revoke all on function public.set_pod_calendar(boolean) from public, anon;
grant execute on function public.set_pod_calendar(boolean) to authenticated;

-- One week (Monday to Sunday, from the Monday on or before p_week) for every active member of the pod.
-- Members who don't share their calendar come back with shares = false and no sessions.
create or replace function public.get_pod_week(p_pod uuid, p_week date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  monday date := date_trunc('week', coalesce(p_week, current_date))::date;
begin
  if not (coalesce(public.my_pod_status(p_pod) = 'active', false) or public.is_pod_coach(p_pod)) then
    return null;
  end if;

  return jsonb_build_object(
    'week', monday,
    'members', coalesce((
      select jsonb_agg(m order by (m ->> 'is_me')::boolean desc, m ->> 'name')
      from (
        select jsonb_build_object(
          'id', p.id,
          'name', coalesce(nullif(p.full_name, ''), 'Athlete'),
          'is_me', p.id = auth.uid(),
          'today', (now() at time zone coalesce(p.timezone, 'America/Chicago'))::date,
          'shares', v.calendar,
          'sessions', case when v.calendar then coalesce((
            select jsonb_agg(jsonb_build_object(
                     'id', w.id,
                     'date', w.scheduled_date,
                     'sport', w.sport,
                     'title', case when w.mystery and w.revealed_at is null and w.status <> 'completed' and not done.yes
                                   then 'Mystery workout' else w.title end,
                     'minutes', case when (w.plan_meta ->> 'planned_duration_min') ~ '^[0-9]+(\.[0-9]+)?$'
                                     then round((w.plan_meta ->> 'planned_duration_min')::numeric) end,
                     'start_time', w.start_time,
                     'done', w.status = 'completed' or done.yes)
                   order by w.scheduled_date, w.start_time nulls last, w.created_at)
            from public.planned_workouts w
            cross join lateral (
              select exists (select 1 from public.activities a where a.planned_workout_id = w.id) as yes) done
            where w.athlete_id = p.id
              and w.deleted_at is null
              and w.status in ('approved', 'sent', 'completed')
              and w.scheduled_date between monday and monday + 6), '[]'::jsonb)
            else '[]'::jsonb end
        ) m
        from public.pod_members pm
        join public.profiles p on p.id = pm.athlete_id
        cross join lateral (select public.pod_can_see(p.id, 'calendar') as calendar) v
        where pm.pod_id = p_pod and pm.status = 'active' and not p.is_test
      ) members
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_pod_week(uuid, date) from public, anon;
grant execute on function public.get_pod_week(uuid, date) to authenticated;

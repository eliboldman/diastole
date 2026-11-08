-- Weather location for forecasts, and pod challenge wrap-ups.

-- ---------------------------------------------------------------- weather
-- Where the athlete usually trains: {"name": "Austin, Texas", "lat": 30.27, "lon": -97.74}.
-- A town, not an address. Used for workout and race-day forecasts.
alter table public.profiles add column weather_location jsonb
  check (weather_location is null or (
    jsonb_typeof(weather_location) = 'object'
    and length(weather_location::text) < 300
    and (weather_location ->> 'lat')::numeric between -90 and 90
    and (weather_location ->> 'lon')::numeric between -180 and 180));
grant update (weather_location) on public.profiles to authenticated;

-- ---------------------------------------------------------------- challenge wrap-ups
-- Each joined (still active) member's total for one challenge. Same rules as get_pod_challenges.
create or replace function private.challenge_totals(p_id uuid)
returns table (athlete_id uuid, first_name text, units text, value numeric)
language sql stable security definer set search_path = ''
as $$
  select e.athlete_id,
         coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'Someone'),
         p.units,
         coalesce((
           select case c.metric
                    when 'hours' then round(sum(coalesce(a.duration_s, 0)) / 3600.0, 1)
                    when 'distance' then round(sum(coalesce(a.distance_m, 0)) / 1000.0, 1)
                    else count(*) filter (where coalesce(a.duration_s, 0) >= 600)
                  end
           from public.activities a
           where a.athlete_id = e.athlete_id
             and (a.start_time at time zone coalesce(p.timezone, 'America/Chicago'))::date between c.starts_on and c.ends_on
             and case c.sport
                   when 'run' then a.sport ~* '(run|treadmill|track|trail)'
                   when 'bike' then a.sport ~* '(cycl|bik|ride|spin)'
                   when 'swim' then a.sport ~* 'swim'
                   else true end), 0)
  from public.pod_challenge_entries e
  join public.pod_challenges c on c.id = e.challenge_id
  join public.profiles p on p.id = e.athlete_id
  where e.challenge_id = p_id
    and exists (select 1 from public.pod_members m where m.pod_id = c.pod_id and m.athlete_id = e.athlete_id and m.status = 'active');
$$;
revoke all on function private.challenge_totals(uuid) from public, anon, authenticated;

-- "9.5 h", "12.4 mi" / "20 km", "4 sessions", in the reader's units.
create or replace function private.challenge_amount(p_metric text, p_value numeric, p_units text)
returns text
language sql immutable set search_path = ''
as $$
  select case p_metric
    when 'hours' then trim(to_char(p_value, 'FM9999990.0')) || ' h'
    when 'distance' then case when p_units = 'km' then trim(to_char(p_value, 'FM9999990.0')) || ' km'
                              else trim(to_char(p_value / 1.609344, 'FM9999990.0')) || ' mi' end
    else p_value::int || case when p_value = 1 then ' session' else ' sessions' end
  end;
$$;

-- Morning job: challenges that ended yesterday (or a day earlier, if a run was missed) get final
-- standings sent to everyone who joined and to the pod's coach. Dedupe keys make reruns safe.
create or replace function public.finish_pod_challenges()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
  t record;
  coach uuid;
  coach_units text;
  total numeric;
  n int;
  leader record;
  runner record;
  place int;
  sent int := 0;
  href text;
begin
  for c in select * from public.pod_challenges where ends_on between current_date - 2 and current_date - 1 loop
    select count(*) into n from private.challenge_totals(c.id);
    if n = 0 then continue; end if;
    select po.coach_id, pr.units into coach, coach_units from public.pods po left join public.profiles pr on pr.id = po.coach_id where po.id = c.pod_id;
    select coalesce(sum(value), 0) into total from private.challenge_totals(c.id);
    select * into leader from private.challenge_totals(c.id) order by value desc, first_name limit 1;
    select * into runner from private.challenge_totals(c.id) order by value desc, first_name offset 1 limit 1;
    href := '/me/pods/' || c.pod_id || '?view=challenges';

    for t in select *, rank() over (order by value desc) as pos from private.challenge_totals(c.id) loop
      if c.mode = 'team' then
        perform private.notify(t.athlete_id, 'pod_challenge',
          left(case when total >= c.goal then '🎉 ' || c.title || ': goal reached!' else '🏁 ' || c.title || ' is over' end, 200),
          'Team total ' || private.challenge_amount(c.metric, total, t.units) || ' of ' || private.challenge_amount(c.metric, c.goal, t.units)
            || '. You added ' || private.challenge_amount(c.metric, t.value, t.units) || '.'
            || case when total >= c.goal then ' Nice work, everyone.' else ' Close one. Run it back?' end,
          href, 'challenge_end:' || c.id, '{}'::jsonb, null);
      else
        place := t.pos;
        perform private.notify(t.athlete_id, 'pod_challenge',
          left(case when place = 1 then '🏆 You won ' || c.title || '!' else '🏁 ' || c.title || ': ' || leader.first_name || ' wins' end, 200),
          case when place = 1 then private.challenge_amount(c.metric, t.value, t.units)
                 || coalesce(', ahead of ' || runner.first_name || ' (' || private.challenge_amount(c.metric, runner.value, t.units) || ')', '') || '.'
               else 'You finished ' || place || case when place % 10 = 2 and place % 100 <> 12 then 'nd' when place % 10 = 3 and place % 100 <> 13 then 'rd' else 'th' end
                 || ' of ' || n || ' with ' || private.challenge_amount(c.metric, t.value, t.units)
                 || '. ' || leader.first_name || ' had ' || private.challenge_amount(c.metric, leader.value, t.units) || '.' end,
          href, 'challenge_end:' || c.id, '{}'::jsonb, null);
      end if;
      sent := sent + 1;
    end loop;

    -- The coach: one summary.
    if coach is not null then
      perform private.notify(coach, 'pod_challenge', left('🏁 ' || c.title || ' is over', 200),
        case when c.mode = 'team'
             then 'Team total ' || private.challenge_amount(c.metric, total, coach_units) || ' of ' || private.challenge_amount(c.metric, c.goal, coach_units)
                  || case when total >= c.goal then ', goal reached' else '' end || '. ' || n || ' took part.'
             else leader.first_name || ' won with ' || private.challenge_amount(c.metric, leader.value, coach_units) || '. ' || n || ' took part.' end,
        '/pods/' || c.pod_id || '?view=challenges', 'challenge_end:' || c.id, '{}'::jsonb, null);
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;
revoke all on function public.finish_pod_challenges() from public, anon, authenticated;
grant execute on function public.finish_pod_challenges() to service_role;

-- ---------------------------------------------------------------- streaks in pods
-- Weekly training streak (weeks in a row with 3+ workouts, through last week, plus this week once
-- it reaches 3) for each active member who shares training with the pod. Just the number.
create or replace function private.week_streak(p_athlete uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  with tz as (select coalesce(timezone, 'America/Chicago') as z from public.profiles where id = p_athlete),
  weeks as (
    select date_trunc('week', a.start_time at time zone (select z from tz))::date as wk
    from public.activities a
    where a.athlete_id = p_athlete and a.start_time > now() - interval '2 years'
    group by 1 having count(*) >= 3
  ),
  anchor as (
    select case when exists (select 1 from weeks where wk = date_trunc('week', now() at time zone (select z from tz))::date)
                then date_trunc('week', now() at time zone (select z from tz))::date
                else date_trunc('week', now() at time zone (select z from tz))::date - 7 end as a
  )
  select count(*)::int from (
    select wk, row_number() over (order by wk desc) as rn from weeks, anchor where wk <= anchor.a
  ) s, anchor
  where s.wk = anchor.a - ((s.rn - 1) * 7)::int;
$$;
revoke all on function private.week_streak(uuid) from public, anon, authenticated;

create or replace function public.get_pod_streaks(p_pod uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_object_agg(m.athlete_id, s.n) filter (where s.n >= 2), '{}'::jsonb)
  from public.pod_members m
  cross join lateral (select private.week_streak(m.athlete_id) as n) s
  where m.pod_id = p_pod and m.status = 'active' and public.in_pod(p_pod)
    and (m.athlete_id = auth.uid() or public.pod_can_see(m.athlete_id, 'training'));
$$;
revoke all on function public.get_pod_streaks(uuid) from public, anon;
grant execute on function public.get_pod_streaks(uuid) to authenticated;

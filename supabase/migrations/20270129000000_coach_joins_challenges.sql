-- Pod coaches can join their own pod's challenges (Eli trains with the team). Before, the coach
-- only organized: the join policy and the totals counted active members only. Joining is still
-- opt-in, and only those who join appear in the standings.

drop policy "challenge_entries: join" on public.pod_challenge_entries;
create policy "challenge_entries: join" on public.pod_challenge_entries for insert to authenticated
  with check (athlete_id = auth.uid() and exists (
    select 1 from public.pod_challenges c
    where c.id = challenge_id and c.ends_on >= current_date - 1
      and (public.my_pod_status(c.pod_id) = 'active' or public.is_pod_coach(c.pod_id))));

create or replace function public.get_pod_challenges(p_pod uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(row order by (row ->> 'ends_on') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', c.id, 'title', c.title, 'metric', c.metric, 'sport', c.sport, 'mode', c.mode, 'goal', c.goal,
      'starts_on', c.starts_on, 'ends_on', c.ends_on, 'created_by', c.created_by,
      'creator', coalesce(nullif(split_part(cp.full_name, ' ', 1), ''), 'Someone'),
      'joined', exists (select 1 from public.pod_challenge_entries e where e.challenge_id = c.id and e.athlete_id = auth.uid()),
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object('athlete_id', e.athlete_id, 'name', coalesce(nullif(p.full_name, ''), 'Athlete'), 'value', coalesce(t.value, 0)) order by coalesce(t.value, 0) desc)
        from public.pod_challenge_entries e
        join public.profiles p on p.id = e.athlete_id
        left join lateral (
          select case c.metric
                   when 'hours' then round(sum(coalesce(a.duration_s, 0)) / 3600.0, 1)
                   when 'distance' then round(sum(coalesce(a.distance_m, 0)) / 1000.0, 1)
                   else count(*) filter (where coalesce(a.duration_s, 0) >= 600)
                 end as value
          from public.activities a
          where a.athlete_id = e.athlete_id
            and (a.start_time at time zone coalesce(p.timezone, 'America/Chicago'))::date between c.starts_on and c.ends_on
            and case c.sport
                  when 'run' then a.sport ~* '(run|treadmill|track|trail)'
                  when 'bike' then a.sport ~* '(cycl|bik|ride|spin)'
                  when 'swim' then a.sport ~* 'swim'
                  else true end
        ) t on true
        where e.challenge_id = c.id
          -- still in the pod, or the pod's coach
          and (exists (select 1 from public.pod_members m where m.pod_id = c.pod_id and m.athlete_id = e.athlete_id and m.status = 'active')
               or exists (select 1 from public.pods po where po.id = c.pod_id and po.coach_id = e.athlete_id))
      ), '[]'::jsonb)
    ) as row
    from public.pod_challenges c
    left join public.profiles cp on cp.id = c.created_by
    where c.pod_id = p_pod and public.in_pod(p_pod) and c.ends_on >= current_date - 14
  ) s;
$$;
revoke all on function public.get_pod_challenges(uuid) from public, anon;
grant execute on function public.get_pod_challenges(uuid) to authenticated;

-- Totals for wrap-ups and team-goal grit: the coach counts once they've joined.
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
    and (exists (select 1 from public.pod_members m where m.pod_id = c.pod_id and m.athlete_id = e.athlete_id and m.status = 'active')
         or exists (select 1 from public.pods po where po.id = c.pod_id and po.coach_id = e.athlete_id));
$$;
revoke all on function private.challenge_totals(uuid) from public, anon, authenticated;

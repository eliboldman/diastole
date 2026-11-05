-- Pod profiles: each athlete chooses what pod mates see. Enforced here, in every function and
-- policy that serves pod mates; the app only displays what these return.
--
-- Sharing levels (profiles.pod_share_level), each including the ones before:
--   0 avatar and name (default) · 1 + readiness · 2 + training and performance
--   (workouts in the feed, FTP, threshold pace, PRs, goal race)
--   + workout details (charts, laps, route): the existing share_workout_details switch, both sides.
-- Health items are separate opt-ins, all off by default: HRV and resting HR, sleep, stress.
-- An athlete's coach always sees everything. Pod mates never see nutrition or pain spots.
--
-- Also: notification preferences (profiles.notify_prefs) that private.notify respects.

alter table public.profiles
  add column pod_share_level smallint not null default 0 check (pod_share_level between 0 and 2),
  add column pod_share_hrv boolean not null default false,
  add column pod_share_sleep boolean not null default false,
  add column pod_share_stress boolean not null default false,
  add column notify_prefs jsonb not null default '{}';

-- People already in a pod accepted under "share everything": keep their workouts and readiness
-- flowing (level 2); health items start off for everyone.
update public.profiles set pod_share_level = 2
where id in (select athlete_id from public.pod_members where status = 'active');

-- What may the caller see of this person? Self and their coach: everything.
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
          when 'hrv' then p.pod_share_hrv
          when 'sleep' then p.pod_share_sleep
          when 'stress' then p.pod_share_stress
          else false end
        from public.profiles p where p.id = p_owner), false)
    );
$$;
revoke all on function public.pod_can_see(uuid, text) from public, anon;
grant execute on function public.pod_can_see(uuid, text) to authenticated;

-- The athlete sets their own sharing. Workout details need the training level.
create or replace function public.set_pod_sharing(p_level integer, p_hrv boolean, p_sleep boolean, p_stress boolean, p_details boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles
     set pod_share_level = case when p_details then 2 else greatest(0, least(2, coalesce(p_level, 0))) end,
         pod_share_hrv = coalesce(p_hrv, false),
         pod_share_sleep = coalesce(p_sleep, false),
         pod_share_stress = coalesce(p_stress, false),
         share_workout_details = coalesce(p_details, false)
   where id = auth.uid();
$$;
revoke all on function public.set_pod_sharing(integer, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_pod_sharing(integer, boolean, boolean, boolean, boolean) to authenticated;

-- Tables pod mates may read under their levels (in addition to self and coach).
create policy "readiness: pod read" on public.readiness_scores for select to authenticated
  using (public.pod_can_see(athlete_id, 'readiness'));
create policy "achievements: pod read" on public.achievements for select to authenticated
  using (public.pod_can_see(athlete_id, 'training'));
create policy "zone_history: pod read" on public.zone_history for select to authenticated
  using (public.pod_can_see(athlete_id, 'training'));
create policy "athlete_goals: pod read" on public.athlete_goals for select to authenticated
  using (public.pod_can_see(athlete_id, 'training'));

-- ---------------------------------------------------------------- the Members tab
create or replace function public.get_pod_feed(p_pod uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if not (coalesce(public.my_pod_status(p_pod) = 'active', false) or public.is_pod_coach(p_pod)) then
    return null;
  end if;

  select jsonb_build_object(
    'pod', (select jsonb_build_object('id', id, 'name', name) from public.pods where id = p_pod),
    'members', coalesce(jsonb_agg(m order by m->>'name'), '[]'::jsonb)
  ) into result
  from (
    select jsonb_build_object(
      'id', p.id,
      'name', coalesce(nullif(p.full_name, ''), 'Athlete'),
      'is_me', p.id = auth.uid(),
      'details', public.can_view_workout_details(p.id),
      'shares', jsonb_build_object(
        'readiness', public.pod_can_see(p.id, 'readiness'), 'training', public.pod_can_see(p.id, 'training'),
        'hrv', public.pod_can_see(p.id, 'hrv'), 'sleep', public.pod_can_see(p.id, 'sleep'), 'stress', public.pod_can_see(p.id, 'stress')),
      'readiness', case when public.pod_can_see(p.id, 'readiness') then (
        select jsonb_build_object('date', r.date, 'overall', r.overall, 'recovery', r.recovery, 'sleep', r.sleep,
                                  'stress', r.stress, 'load', r.load, 'note', r.note)
        from public.readiness_scores r where r.athlete_id = p.id order by r.date desc limit 1) end,
      'wellness', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'date', w.date,
                 'hrv_ms', case when public.pod_can_see(p.id, 'hrv') then w.hrv_ms end,
                 'resting_hr', case when public.pod_can_see(p.id, 'hrv') then w.resting_hr end,
                 'sleep_seconds', case when public.pod_can_see(p.id, 'sleep') then w.sleep_seconds end,
                 'stress_avg', case when public.pod_can_see(p.id, 'stress') then w.stress_avg end) order by w.date)
        from public.daily_wellness w where w.athlete_id = p.id and w.date >= current_date - 14
          and (public.pod_can_see(p.id, 'hrv') or public.pod_can_see(p.id, 'sleep') or public.pod_can_see(p.id, 'stress'))), '[]'::jsonb),
      'activities', case when public.pod_can_see(p.id, 'training') then coalesce((
        select jsonb_agg(a order by a->>'start_time' desc) from (
          select jsonb_build_object('id', x.id, 'sport', x.sport, 'start_time', x.start_time, 'duration_s', x.duration_s,
                                    'distance_m', x.distance_m, 'avg_hr', x.avg_hr) a
          from public.activities x where x.athlete_id = p.id order by x.start_time desc limit 10) acts), '[]'::jsonb)
        else '[]'::jsonb end
    ) m
    from public.pod_members pm
    join public.profiles p on p.id = pm.athlete_id
    where pm.pod_id = p_pod and pm.status = 'active'
  ) members;

  return result;
end;
$$;

-- ---------------------------------------------------------------- the Feed tab: training level only, plus PR moments
create or replace function public.get_pod_activity_feed(p_pod uuid, p_before timestamptz default null, p_limit integer default 15)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  coach boolean := public.is_pod_coach(p_pod);
  lim integer := least(greatest(coalesce(p_limit, 15), 1), 40);
begin
  if not (coalesce(public.my_pod_status(p_pod) = 'active', false) or coach) then return null; end if;

  return coalesce((
    select jsonb_agg(item order by (item ->> 'start_time') desc)
    from (
      select jsonb_build_object(
        'id', a.id,
        'athlete_id', a.athlete_id,
        'athlete_name', coalesce(nullif(p.full_name, ''), 'Athlete'),
        'is_me', a.athlete_id = auth.uid(),
        'can_rename', a.athlete_id = auth.uid() or public.is_coach_of(a.athlete_id),
        'sport', a.sport,
        'name', a.name,
        'start_time', a.start_time,
        'local_hour', extract(hour from a.start_time at time zone coalesce(p.timezone, 'America/Los_Angeles'))::int,
        'duration_s', a.duration_s,
        'distance_m', a.distance_m,
        'avg_speed_mps', a.avg_speed_mps,
        'avg_hr', a.avg_hr,
        'avg_power', a.avg_power,
        'elevation_gain_m', a.elevation_gain_m,
        'training_load', a.training_load,
        'details', v.details,
        'route', case when v.details and d.route is not null and jsonb_typeof(d.route) = 'array' then (
                   select jsonb_agg(pt order by i) from jsonb_array_elements(d.route) with ordinality e(pt, i)
                   where (i - 1) % greatest(1, jsonb_array_length(d.route) / 60) = 0) end,
        'pool_unit', case when v.details then d.streams -> 'pool' ->> 'unit' end,
        -- PR moments: an improvement on an earlier best, set in this workout.
        'prs', coalesce((
          select jsonb_agg(jsonb_build_object('key', x.key, 'value', x.value))
          from public.achievements x
          where x.activity_id = a.id and x.key like 'pr\_%'
            and exists (select 1 from public.achievements y where y.athlete_id = x.athlete_id and y.key = x.key and y.achieved_at < x.achieved_at)), '[]'::jsonb),
        'props', coalesce((
          select jsonb_agg(t order by t.total desc) from (
            select sticker, sum(count)::bigint as total, count(distinct from_id) as senders,
                   bool_or(from_id = auth.uid()) as from_me, bool_and(hidden) as hidden
            from public.pod_props
            where activity_id = a.id and pod_id = p_pod and sticker <> 'comment' and (coach or not hidden)
            group by sticker) t), '[]'::jsonb),
        'comment_count', (select count(*) from public.pod_props
                          where activity_id = a.id and pod_id = p_pod and note is not null and (coach or not hidden)),
        'comments', coalesce((
          select jsonb_agg(n order by n.created_at) from (
            select pp.id, pp.sticker, pp.note, pp.hidden, pp.created_at,
                   pp.from_id = auth.uid() as from_me, pp.to_id = auth.uid() as to_me,
                   coalesce(nullif(split_part(fp.full_name, ' ', 1), ''), case when fp.role = 'coach' then 'Coach' else 'Someone' end) as from_name
            from public.pod_props pp join public.profiles fp on fp.id = pp.from_id
            where pp.activity_id = a.id and pp.pod_id = p_pod and pp.note is not null and (coach or not pp.hidden)
            order by pp.created_at desc limit 30) n), '[]'::jsonb)
      ) as item
      from public.activities a
      join public.pod_members pm on pm.athlete_id = a.athlete_id and pm.pod_id = p_pod and pm.status = 'active'
      join public.profiles p on p.id = a.athlete_id
      cross join lateral (select public.can_view_workout_details(a.athlete_id) as details) v
      left join public.activity_details d on d.activity_id = a.id
      where a.start_time > now() - interval '60 days'
        and (p_before is null or a.start_time < p_before)
        and not p.is_test
        and public.pod_can_see(a.athlete_id, 'training')
      order by a.start_time desc
      limit lim
    ) rows
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------- a pod mate's avatar page
create or replace function public.get_pod_profile(p_athlete uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  readiness boolean := public.pod_can_see(p_athlete, 'readiness');
  training boolean := public.pod_can_see(p_athlete, 'training');
  hrv boolean := public.pod_can_see(p_athlete, 'hrv');
  sleep boolean := public.pod_can_see(p_athlete, 'sleep');
  stress boolean := public.pod_can_see(p_athlete, 'stress');
begin
  if not public.pod_can_see(p_athlete, 'avatar') then return null; end if;
  return (
    select jsonb_build_object(
      'id', p.id,
      'name', coalesce(nullif(p.full_name, ''), 'Athlete'),
      'timezone', p.timezone,
      'shares', jsonb_build_object('readiness', readiness, 'training', training, 'hrv', hrv, 'sleep', sleep, 'stress', stress,
                                   'details', public.can_view_workout_details(p.id)),
      'look', (select look from public.avatars where athlete_id = p.id),
      'readiness', case when readiness then (
        select jsonb_build_object('date', r.date, 'overall', r.overall, 'note', r.note)
        from public.readiness_scores r where r.athlete_id = p.id order by r.date desc limit 1) end,
      -- Muscles still recovering (the avatar's colors) go with readiness.
      'strain', case when readiness then coalesce((
        select jsonb_agg(jsonb_build_object('strain', coalesce(s.custom, s.auto), 'at', a.start_time))
        from public.activity_strain s join public.activities a on a.id = s.activity_id
        where s.athlete_id = p.id and a.start_time > now() - interval '3 days'), '[]'::jsonb) end,
      'zones', case when training then coalesce((
        select jsonb_agg(jsonb_build_object('field', z.field, 'value', z.value, 'changed_at', z.changed_at) order by z.changed_at)
        from public.zone_history z where z.athlete_id = p.id and z.field in ('ftp_w', 'threshold_speed_mps')), '[]'::jsonb) end,
      'achievements', case when training then coalesce((
        select jsonb_agg(jsonb_build_object('key', x.key, 'value', x.value, 'activity_id', x.activity_id, 'achieved_at', x.achieved_at) order by x.achieved_at)
        from public.achievements x where x.athlete_id = p.id), '[]'::jsonb) end,
      'goals', case when training then (
        select jsonb_build_object('race_name', g.race_name, 'race_date', g.race_date, 'block_name', g.block_name, 'block_ends', g.block_ends)
        from public.athlete_goals g where g.athlete_id = p.id) end,
      'activities', case when training then coalesce((
        select jsonb_agg(x order by x->>'start_time' desc) from (
          select jsonb_build_object('id', a.id, 'sport', a.sport, 'name', a.name, 'start_time', a.start_time,
                                    'duration_s', a.duration_s, 'distance_m', a.distance_m, 'start_week', date_trunc('week', a.start_time)) x
          from public.activities a where a.athlete_id = p.id and a.start_time > now() - interval '56 days' order by a.start_time desc limit 60) t), '[]'::jsonb) end,
      'wellness', case when hrv or sleep or stress then coalesce((
        select jsonb_agg(jsonb_build_object(
                 'date', w.date,
                 'hrv_ms', case when hrv then w.hrv_ms end,
                 'resting_hr', case when hrv then w.resting_hr end,
                 'sleep_seconds', case when sleep then w.sleep_seconds end,
                 'stress_avg', case when stress then w.stress_avg end) order by w.date)
        from public.daily_wellness w where w.athlete_id = p.id and w.date >= current_date - 60), '[]'::jsonb) end
    )
    from public.profiles p where p.id = p_athlete
  );
end;
$$;
revoke all on function public.get_pod_profile(uuid) from public, anon;
grant execute on function public.get_pod_profile(uuid) to authenticated;

-- ---------------------------------------------------------------- notification preferences
-- Groups the athlete can turn off: props, comments, messages, pods, workouts, coaching.
-- Garmin disconnects always come through (the data stops otherwise).
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
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined') then 'coaching'
    else null end;
$$;

create or replace function private.notify(
  p_user uuid, p_kind text, p_title text, p_body text, p_href text,
  p_key text default null, p_meta jsonb default '{}', p_actor uuid default auth.uid()
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  grp text := private.notify_group(p_kind, p_meta);
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  if exists (select 1 from public.profiles where id = p_user and is_test) then return; end if;
  if grp is not null and exists (select 1 from public.profiles where id = p_user and (notify_prefs ->> grp) = 'false') then return; end if;

  insert into public.notifications (user_id, actor_id, kind, title, body, href, meta, dedupe_key)
  values (p_user, p_actor, p_kind, left(p_title, 200), left(p_body, 500), p_href, coalesce(p_meta, '{}'),
          coalesce(p_key, gen_random_uuid()::text))
  on conflict (user_id, dedupe_key) do update
    set title = excluded.title, body = excluded.body, href = excluded.href, meta = excluded.meta,
        actor_id = excluded.actor_id, read_at = null, dismissed_at = null, created_at = now();
exception when others then
  raise warning 'notify failed: %', sqlerrm;
end;
$$;

create or replace function public.set_notify_prefs(p_prefs jsonb)
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles
     set notify_prefs = (
       select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(p_prefs)
       where key in ('props', 'comments', 'messages', 'pods', 'workouts', 'coaching') and jsonb_typeof(value) = 'boolean')
   where id = auth.uid();
$$;
revoke all on function public.set_notify_prefs(jsonb) from public, anon;
grant execute on function public.set_notify_prefs(jsonb) to authenticated;

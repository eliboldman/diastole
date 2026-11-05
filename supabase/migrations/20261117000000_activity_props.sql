-- Props on activities + a pod activity feed, and member props that reset daily.
--
-- * pod_props.activity_id: a send can be pinned to one of the recipient's activities (kudos-style).
--   Those stay on the activity. Sends without an activity are "today's props" on the member card,
--   which start over at midnight in the pod coach's timezone. Nothing is deleted: history stays.
-- * get_pod_activity_feed(): pod members' activities, newest first, with each one's props.
--   Same visibility as get_pod_feed (active member or the pod's coach); route and pool unit only
--   when the caller may open that member's workout details.

alter table public.pod_props add column activity_id uuid references public.activities (id) on delete cascade;
create index pod_props_activity on public.pod_props (activity_id, created_at desc) where activity_id is not null;

-- Start of "today" for a pod, in its coach's timezone.
create or replace function private.pod_day_start(p_pod uuid)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select date_trunc('day', now() at time zone tz) at time zone tz
  from (select coalesce((select p.timezone from public.pods d join public.profiles p on p.id = d.coach_id where d.id = p_pod),
                        'America/Los_Angeles') as tz) z;
$$;

-- ---------------------------------------------------------------- send (now optionally on an activity)
drop function public.send_pod_props(uuid, uuid, text, integer, text);
create or replace function public.send_pod_props(p_pod uuid, p_to uuid, p_sticker text, p_count integer, p_note text default null, p_activity uuid default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clean_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
begin
  if me is null then return 'Sign in first.'; end if;
  if p_to = me then return 'self'; end if;
  if not (coalesce(public.my_pod_status(p_pod) = 'active', false) or public.is_pod_coach(p_pod)) then
    return 'You''re not in this pod.';
  end if;
  if not exists (select 1 from public.pod_members where pod_id = p_pod and athlete_id = p_to and status = 'active') then
    return 'They''re not in this pod.';
  end if;
  if p_activity is not null and not exists (select 1 from public.activities where id = p_activity and athlete_id = p_to) then
    return 'That workout isn''t theirs.';
  end if;
  if p_sticker !~ '^[a-z0-9_]{1,40}$' or p_count is null or p_count < 1 or p_count > 1000000 then
    return 'That sticker doesn''t exist.';
  end if;
  if (select count(*) from public.pod_props where from_id = me and created_at > now() - interval '10 minutes') >= 60 then
    return 'slow';
  end if;

  if length(clean_note) > 120 then return 'Keep the note to 120 characters.'; end if;

  insert into public.pod_props (pod_id, from_id, to_id, sticker, count, note, activity_id)
  values (p_pod, me, p_to, p_sticker, p_count, clean_note, p_activity);
  return null; -- null = sent
end;
$$;

-- The recipient hides every one of a sticker sent to them, on the member card (no activity) or one activity.
drop function public.hide_pod_props(uuid, text);
create or replace function public.hide_pod_props(p_pod uuid, p_sticker text, p_activity uuid default null)
returns void
language sql security definer set search_path = ''
as $$
  update public.pod_props set hidden = true
  where pod_id = p_pod and to_id = auth.uid() and sticker = p_sticker and activity_id is not distinct from p_activity;
$$;

-- ---------------------------------------------------------------- member props: today only
create or replace function public.get_pod_props(p_pod uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  coach boolean := public.is_pod_coach(p_pod);
  day_start timestamptz := private.pod_day_start(p_pod);
begin
  if not (coalesce(public.my_pod_status(p_pod) = 'active', false) or coach) then return null; end if;

  return jsonb_build_object(
    'day_start', day_start,
    -- Today's member-card props, with the all-time count for the same sticker alongside.
    'totals', coalesce((
      select jsonb_agg(t) from (
        select to_id, sticker,
               sum(count) filter (where created_at >= day_start)::bigint as total,
               sum(count)::bigint as all_time,
               count(distinct from_id) filter (where created_at >= day_start) as senders,
               coalesce(bool_or(from_id = auth.uid()) filter (where created_at >= day_start), false) as from_me,
               bool_and(hidden) filter (where created_at >= day_start) as hidden
        from public.pod_props
        where pod_id = p_pod and activity_id is null and (coach or not hidden)
        group by to_id, sticker
        having sum(count) filter (where created_at >= day_start) > 0) t), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(r order by r.created_at desc) from (
        select pp.id, pp.to_id, pp.sticker, pp.count, pp.note, pp.hidden, pp.created_at, pp.activity_id,
               a.sport as activity_sport,
               pp.to_id = auth.uid() as to_me, pp.from_id = auth.uid() as from_me,
               coalesce(nullif(split_part(p.full_name, ' ', 1), ''), case when p.role = 'coach' then 'Coach' else 'Someone' end) as from_name
        from public.pod_props pp
        join public.profiles p on p.id = pp.from_id
        left join public.activities a on a.id = pp.activity_id
        where pp.pod_id = p_pod and (coach or not pp.hidden)
        order by pp.created_at desc limit 40) r), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------- activity feed
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
        -- A light route for the card (about 60 points), already trimmed near start/finish at ingest.
        'route', case when v.details and d.route is not null and jsonb_typeof(d.route) = 'array' then (
                   select jsonb_agg(pt order by i) from jsonb_array_elements(d.route) with ordinality e(pt, i)
                   where (i - 1) % greatest(1, jsonb_array_length(d.route) / 60) = 0) end,
        'pool_unit', case when v.details then d.streams -> 'pool' ->> 'unit' end,
        'props', coalesce((
          select jsonb_agg(t order by t.total desc) from (
            select sticker, sum(count)::bigint as total, count(distinct from_id) as senders,
                   bool_or(from_id = auth.uid()) as from_me, bool_and(hidden) as hidden
            from public.pod_props
            where activity_id = a.id and pod_id = p_pod and (coach or not hidden)
            group by sticker) t), '[]'::jsonb),
        'notes', coalesce((
          select jsonb_agg(n order by n.created_at) from (
            select pp.id, pp.sticker, pp.note, pp.hidden, pp.created_at,
                   pp.from_id = auth.uid() as from_me, pp.to_id = auth.uid() as to_me,
                   coalesce(nullif(split_part(fp.full_name, ' ', 1), ''), case when fp.role = 'coach' then 'Coach' else 'Someone' end) as from_name
            from public.pod_props pp join public.profiles fp on fp.id = pp.from_id
            where pp.activity_id = a.id and pp.pod_id = p_pod and pp.note is not null and (coach or not pp.hidden)
            order by pp.created_at desc limit 5) n), '[]'::jsonb)
      ) as item
      from public.activities a
      join public.pod_members pm on pm.athlete_id = a.athlete_id and pm.pod_id = p_pod and pm.status = 'active'
      join public.profiles p on p.id = a.athlete_id
      cross join lateral (select public.can_view_workout_details(a.athlete_id) as details) v
      left join public.activity_details d on d.activity_id = a.id
      where a.start_time > now() - interval '60 days'
        and (p_before is null or a.start_time < p_before)
        and not p.is_test
      order by a.start_time desc
      limit lim
    ) rows
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------- notifications: link activity props to the activity
create or replace function private.on_pod_props()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  key text := 'props:' || new.from_id || ':' || coalesce(new.activity_id::text || ':', '') || to_char(new.created_at at time zone 'utc', 'YYYYMMDDHH24');
  prior jsonb;
  stickers jsonb;
  total bigint;
  sport text;
begin
  select meta into prior from public.notifications where user_id = new.to_id and dedupe_key = key;
  stickers := coalesce(prior -> 'stickers', '{}'::jsonb);
  stickers := stickers || jsonb_build_object(new.sticker, coalesce((stickers ->> new.sticker)::bigint, 0) + new.count);
  select sum(value::bigint) into total from jsonb_each_text(stickers);
  if new.activity_id is not null then
    select coalesce(nullif(replace(a.sport, '_', ' '), ''), 'workout') into sport from public.activities a where a.id = new.activity_id;
  end if;

  perform private.notify(new.to_id, 'pod_props',
    private.display_name(new.from_id) || case when new.activity_id is null then ' sent you props' else ' gave props on your ' || coalesce(sport, 'workout') end,
    case when new.note is not null or coalesce((prior ->> 'note')::boolean, false) then 'With a note.' else null end,
    case when new.activity_id is null then '/me/pods/' || new.pod_id else '/activity/' || new.activity_id end, key,
    jsonb_build_object('stickers', stickers, 'total', total, 'pod_id', new.pod_id, 'activity_id', new.activity_id,
                       'note', new.note is not null or coalesce((prior ->> 'note')::boolean, false)), new.from_id);
  return new;
end;
$$;

revoke all on function public.send_pod_props(uuid, uuid, text, integer, text, uuid) from public, anon;
revoke all on function public.hide_pod_props(uuid, text, uuid) from public, anon;
revoke all on function public.get_pod_activity_feed(uuid, timestamptz, integer) from public, anon;
revoke all on function private.pod_day_start(uuid) from public, anon, authenticated;
grant execute on function public.send_pod_props(uuid, uuid, text, integer, text, uuid) to authenticated;
grant execute on function public.hide_pod_props(uuid, text, uuid) to authenticated;
grant execute on function public.get_pod_activity_feed(uuid, timestamptz, integer) to authenticated;

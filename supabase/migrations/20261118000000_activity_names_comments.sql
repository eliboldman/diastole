-- Activity names you choose + comments on activities in the pod feed.
--
-- * activities.name_locked: set when the athlete (or their coach) renames an activity. Garmin re-sends
--   the name on every update, so a trigger keeps a locked name unless the change comes from
--   rename_activity(). Clearing the name unlocks it and restores Garmin's own name from raw.
-- * Comments are pod_props rows with the reserved sticker 'comment' (count 1, note required, always
--   on an activity). The activity's owner may comment on their own activity (replies), which is the
--   one case where from_id = to_id. Comments never count toward props totals.

alter table public.activities add column name_locked boolean not null default false;

create or replace function private.keep_locked_name()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.name_locked and coalesce(current_setting('diastole.renaming', true), '') <> '1' then
    new.name := old.name;
    new.name_locked := true;
  end if;
  return new;
end;
$$;
create trigger keep_locked_name before update on public.activities
  for each row execute function private.keep_locked_name();

-- Rename (1-80 characters) or, with an empty name, go back to the name the watch gave it.
create or replace function public.rename_activity(p_id uuid, p_name text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid;
  clean text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  select athlete_id into owner from public.activities where id = p_id;
  if owner is null or not (owner = auth.uid() or public.is_coach_of(owner)) then return 'You can''t rename that workout.'; end if;
  if length(clean) > 80 then return 'Keep the name to 80 characters.'; end if;
  perform set_config('diastole.renaming', '1', true);
  update public.activities
    set name = coalesce(clean, nullif(raw ->> 'activityName', '')), name_locked = clean is not null
    where id = p_id;
  perform set_config('diastole.renaming', '', true);
  return null;
end;
$$;

-- ---------------------------------------------------------------- comments
alter table public.pod_props drop constraint pod_props_check;
alter table public.pod_props add constraint pod_props_not_self check (from_id <> to_id or sticker = 'comment');

drop function public.send_pod_props(uuid, uuid, text, integer, text, uuid);
create or replace function public.send_pod_props(p_pod uuid, p_to uuid, p_sticker text, p_count integer, p_note text default null, p_activity uuid default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clean_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
  is_comment boolean := p_sticker = 'comment';
begin
  if me is null then return 'Sign in first.'; end if;
  if p_to = me and not (is_comment and p_activity is not null) then return 'self'; end if;
  if not (coalesce(public.my_pod_status(p_pod) = 'active', false) or public.is_pod_coach(p_pod)) then
    return 'You''re not in this pod.';
  end if;
  if not exists (select 1 from public.pod_members where pod_id = p_pod and athlete_id = p_to and status = 'active') then
    return 'They''re not in this pod.';
  end if;
  if p_activity is not null and not exists (select 1 from public.activities where id = p_activity and athlete_id = p_to) then
    return 'That workout isn''t theirs.';
  end if;
  if is_comment and (p_activity is null or clean_note is null) then return 'Write something first.'; end if;
  if p_sticker !~ '^[a-z0-9_]{1,40}$' or p_count is null or p_count < 1 or p_count > 1000000 then
    return 'That sticker doesn''t exist.';
  end if;
  if (select count(*) from public.pod_props where from_id = me and created_at > now() - interval '10 minutes') >= 60 then
    return 'slow';
  end if;

  if length(clean_note) > 120 then return 'Keep it to 120 characters.'; end if;

  insert into public.pod_props (pod_id, from_id, to_id, sticker, count, note, activity_id)
  values (p_pod, me, p_to, p_sticker, case when is_comment then 1 else p_count end, clean_note, p_activity);
  return null; -- null = sent
end;
$$;

-- The author takes back their own comment or note.
create or replace function public.delete_pod_comment(p_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.pod_props where id = p_id and from_id = auth.uid() and sticker = 'comment';
$$;

-- Member props: comments are never on the member card.
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
    'totals', coalesce((
      select jsonb_agg(t) from (
        select to_id, sticker,
               sum(count) filter (where created_at >= day_start)::bigint as total,
               sum(count)::bigint as all_time,
               count(distinct from_id) filter (where created_at >= day_start) as senders,
               coalesce(bool_or(from_id = auth.uid()) filter (where created_at >= day_start), false) as from_me,
               bool_and(hidden) filter (where created_at >= day_start) as hidden
        from public.pod_props
        where pod_id = p_pod and activity_id is null and sticker <> 'comment' and (coach or not hidden)
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
        where pp.pod_id = p_pod and pp.sticker <> 'comment' and (coach or not pp.hidden)
        order by pp.created_at desc limit 40) r), '[]'::jsonb)
  );
end;
$$;

-- Feed: props exclude comments; 'comments' is the conversation (sticker notes + comments), oldest first.
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
      order by a.start_time desc
      limit lim
    ) rows
  ), '[]'::jsonb);
end;
$$;

-- Notifications: comments read as comments, with the text.
create or replace function private.on_pod_props()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  key text;
  prior jsonb;
  stickers jsonb;
  total bigint;
  sport text;
begin
  if new.activity_id is not null then
    select coalesce(nullif(replace(a.sport, '_', ' '), ''), 'workout') into sport from public.activities a where a.id = new.activity_id;
  end if;

  if new.sticker = 'comment' then
    perform private.notify(new.to_id, 'pod_props',
      private.display_name(new.from_id) || ' commented on your ' || coalesce(sport, 'workout'),
      new.note, '/me/pods/' || new.pod_id || '?view=feed', null,
      jsonb_build_object('comment', true, 'pod_id', new.pod_id, 'activity_id', new.activity_id), new.from_id);
    return new;
  end if;

  key := 'props:' || new.from_id || ':' || coalesce(new.activity_id::text || ':', '') || to_char(new.created_at at time zone 'utc', 'YYYYMMDDHH24');
  select meta into prior from public.notifications where user_id = new.to_id and dedupe_key = key;
  stickers := coalesce(prior -> 'stickers', '{}'::jsonb);
  stickers := stickers || jsonb_build_object(new.sticker, coalesce((stickers ->> new.sticker)::bigint, 0) + new.count);
  select sum(value::bigint) into total from jsonb_each_text(stickers);

  perform private.notify(new.to_id, 'pod_props',
    private.display_name(new.from_id) || case when new.activity_id is null then ' sent you props' else ' gave props on your ' || coalesce(sport, 'workout') end,
    case when new.note is not null or coalesce((prior ->> 'note')::boolean, false) then 'With a note.' else null end,
    case when new.activity_id is null then '/me/pods/' || new.pod_id else '/me/pods/' || new.pod_id || '?view=feed' end, key,
    jsonb_build_object('stickers', stickers, 'total', total, 'pod_id', new.pod_id, 'activity_id', new.activity_id,
                       'note', new.note is not null or coalesce((prior ->> 'note')::boolean, false)), new.from_id);
  return new;
end;
$$;

revoke all on function public.rename_activity(uuid, text) from public, anon;
revoke all on function public.send_pod_props(uuid, uuid, text, integer, text, uuid) from public, anon;
revoke all on function public.delete_pod_comment(uuid) from public, anon;
grant execute on function public.rename_activity(uuid, text) to authenticated;
grant execute on function public.send_pod_props(uuid, uuid, text, integer, text, uuid) to authenticated;
grant execute on function public.delete_pod_comment(uuid) to authenticated;

-- Virtual training camps inside a pod: the coach picks one of their plan templates and dates;
-- members opt in, and joining puts the camp on their own calendar scaled to their zones (a normal
-- plan application). Ticks and the collective goal come from get_camp_board, which shows each
-- member's done/missed days but never ranks anyone. Daily messages are from the coach.

create table public.pod_camps (
  id           uuid primary key default gen_random_uuid(),
  pod_id       uuid not null references public.pods (id) on delete cascade,
  coach_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  template_id  uuid references public.plan_templates (id) on delete set null,
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  blurb        text check (blurb is null or char_length(blurb) <= 400),
  starts_on    date not null, -- a Monday (templates run Monday-based weeks)
  ends_on      date not null,
  goal_metric  text not null default 'sessions' check (goal_metric in ('sessions', 'hours', 'distance')),
  goal_value   numeric not null check (goal_value > 0 and goal_value <= 100000),
  created_at   timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 27)
);
create index pod_camps_pod on public.pod_camps (pod_id, starts_on desc);
alter table public.pod_camps enable row level security;
create policy "pod_camps: pod reads" on public.pod_camps for select to authenticated using (public.in_pod(pod_id));
create policy "pod_camps: coach writes" on public.pod_camps for all to authenticated
  using (public.is_pod_coach(pod_id)) with check (public.is_pod_coach(pod_id) and coach_id = auth.uid());
grant select, insert, update, delete on public.pod_camps to authenticated;

create table public.camp_members (
  camp_id         uuid not null references public.pod_camps (id) on delete cascade,
  athlete_id      uuid not null references public.profiles (id) on delete cascade,
  status          text not null check (status in ('joined', 'declined', 'left')),
  application_id  uuid references public.plan_applications (id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (camp_id, athlete_id)
);
alter table public.camp_members enable row level security;
create policy "camp_members: pod reads" on public.camp_members for select to authenticated
  using (exists (select 1 from public.pod_camps c where c.id = camp_id and public.in_pod(c.pod_id)));
grant select on public.camp_members to authenticated; -- written by the server (joining creates workouts)

create table public.camp_messages (
  camp_id  uuid not null references public.pod_camps (id) on delete cascade,
  date     date not null,
  body     text not null check (char_length(btrim(body)) between 1 and 600),
  primary key (camp_id, date)
);
alter table public.camp_messages enable row level security;
create policy "camp_messages: pod reads" on public.camp_messages for select to authenticated
  using (exists (select 1 from public.pod_camps c where c.id = camp_id and public.in_pod(c.pod_id)));
create policy "camp_messages: coach writes" on public.camp_messages for all to authenticated
  using (exists (select 1 from public.pod_camps c where c.id = camp_id and public.is_pod_coach(c.pod_id)))
  with check (exists (select 1 from public.pod_camps c where c.id = camp_id and public.is_pod_coach(c.pod_id)));
grant select, insert, update, delete on public.camp_messages to authenticated;

-- Ticks per joined member (first name, each camp day's sessions and whether they're done) and the
-- collective total toward the goal. Pod members and the coach only.
create or replace function public.get_camp_board(p_camp uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with c as (
    select * from public.pod_camps where id = p_camp and public.in_pod(pod_id)
  ), m as (
    select cm.athlete_id, cm.application_id, cm.status, p.full_name, coalesce(p.timezone, 'America/Chicago') as tz
    from public.camp_members cm join public.profiles p on p.id = cm.athlete_id, c
    where cm.camp_id = c.id and cm.status in ('joined', 'left') -- stepping out keeps what you did
      and exists (select 1 from public.pod_members pm where pm.pod_id = c.pod_id and pm.athlete_id = cm.athlete_id and pm.status = 'active')
  ), days as (
    select m.athlete_id, w.scheduled_date as d,
      count(*) as planned,
      count(*) filter (where w.status = 'completed') as done
    from m join public.planned_workouts w on w.plan_application_id = m.application_id and w.deleted_at is null
    group by m.athlete_id, w.scheduled_date
  ), acts as (
    select m.athlete_id, a.duration_s, a.distance_m
    from m join public.activities a on a.athlete_id = m.athlete_id, c
    where (a.start_time at time zone m.tz)::date between c.starts_on and c.ends_on
      and coalesce(a.duration_s, 0) >= 600
  )
  select case when not exists (select 1 from c) then null else jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.athlete_id,
        'name', coalesce(nullif(split_part(m.full_name, ' ', 1), ''), 'Athlete'),
        'in', m.status = 'joined',
        'days', coalesce((select jsonb_object_agg(d.d, jsonb_build_object('planned', d.planned, 'done', d.done)) from days d where d.athlete_id = m.athlete_id), '{}'::jsonb)
      ) order by m.full_name)
      from m
    ), '[]'::jsonb),
    'total', (select case c.goal_metric
        when 'hours' then (select round(coalesce(sum(duration_s), 0) / 3600.0, 1) from acts)
        when 'distance' then (select round(coalesce(sum(distance_m), 0) / 1000.0, 1) from acts)
        else (select coalesce(sum(done), 0) from days) end from c)
  ) end;
$$;
revoke all on function public.get_camp_board(uuid) from public, anon;
grant execute on function public.get_camp_board(uuid) to authenticated;

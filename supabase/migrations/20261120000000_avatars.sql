-- Phase 8: avatars, the avatar page's metrics, and achievements.
--
-- * avatars.look: the athlete's own choices (body type, sliders, colors, parts) as JSON; the app's
--   parts list (data, not code) gives them meaning. Proportions are only ever what the athlete picked.
--   Visible to the athlete, their coach and active pod mates ("avatar and name" is the base sharing level).
-- * athlete_zones gains threshold_hr; zone_history keeps every change so the page can show trends and
--   "last updated" for FTP, threshold pace and threshold HR.
-- * athlete_goals: the coach sets a goal race and the current training block; the athlete reads them.
-- * achievements: PRs and other real milestones, one row per improvement (history), written by the
--   server only. Some unlock avatar gear.
-- * activity_details.bests: per-workout best efforts (fastest 1 mi / 5K / 10K / half, best 20-min power),
--   computed once from the streams.

create table public.avatars (
  athlete_id  uuid primary key references public.profiles (id) on delete cascade,
  look        jsonb not null default '{}',
  updated_at  timestamptz not null default now(),
  check (pg_column_size(look) < 8192)
);
alter table public.avatars enable row level security;

-- Active members of a common pod.
create or replace function public.shares_pod_with(p_other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.pod_members a
    join public.pod_members b on b.pod_id = a.pod_id
    where a.athlete_id = p_other and a.status = 'active'
      and b.athlete_id = auth.uid() and b.status = 'active'
  ) or exists (
    -- a pod's coach sees its members, and members see their pod's coach
    select 1 from public.pods d join public.pod_members m on m.pod_id = d.id and m.status = 'active'
    where (d.coach_id = auth.uid() and m.athlete_id = p_other) or (d.coach_id = p_other and m.athlete_id = auth.uid())
  );
$$;

create policy "avatars: read" on public.avatars for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id) or athlete_id = public.my_coach_id() or public.shares_pod_with(athlete_id));
create policy "avatars: own insert" on public.avatars for insert to authenticated with check (athlete_id = auth.uid());
create policy "avatars: own update" on public.avatars for update to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
grant select, insert, update on public.avatars to authenticated;

-- Looks for a list of people, leaving out anyone the caller may not see (RLS above).
create or replace function public.get_avatars(p_ids uuid[])
returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_object_agg(athlete_id, look), '{}'::jsonb) from public.avatars where athlete_id = any (p_ids);
$$;
grant execute on function public.get_avatars(uuid[]) to authenticated;

-- ---------------------------------------------------------------- zones: threshold HR + history
alter table public.athlete_zones add column threshold_hr integer check (threshold_hr between 100 and 220);

create table public.zone_history (
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  field       text not null check (field in ('ftp_w', 'threshold_speed_mps', 'threshold_hr', 'max_hr')),
  value       numeric not null,
  changed_at  timestamptz not null default now(),
  primary key (athlete_id, field, changed_at)
);
alter table public.zone_history enable row level security;
create policy "zone_history: read" on public.zone_history for select to authenticated using (public.can_see_athlete(athlete_id));
grant select on public.zone_history to authenticated;

create or replace function private.track_zones()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.ftp_w is not null and new.ftp_w is distinct from (case when tg_op = 'UPDATE' then old.ftp_w end) then
    insert into public.zone_history (athlete_id, field, value) values (new.athlete_id, 'ftp_w', new.ftp_w) on conflict do nothing;
  end if;
  if new.threshold_speed_mps is not null and new.threshold_speed_mps is distinct from (case when tg_op = 'UPDATE' then old.threshold_speed_mps end) then
    insert into public.zone_history (athlete_id, field, value) values (new.athlete_id, 'threshold_speed_mps', new.threshold_speed_mps) on conflict do nothing;
  end if;
  if new.threshold_hr is not null and new.threshold_hr is distinct from (case when tg_op = 'UPDATE' then old.threshold_hr end) then
    insert into public.zone_history (athlete_id, field, value) values (new.athlete_id, 'threshold_hr', new.threshold_hr) on conflict do nothing;
  end if;
  if new.max_hr is not null and new.max_hr is distinct from (case when tg_op = 'UPDATE' then old.max_hr end) then
    insert into public.zone_history (athlete_id, field, value) values (new.athlete_id, 'max_hr', new.max_hr) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger track_zones after insert or update on public.athlete_zones
  for each row execute function private.track_zones();

-- Seed history with today's values so existing numbers have a "since" date.
insert into public.zone_history (athlete_id, field, value, changed_at)
select athlete_id, f, v, updated_at from public.athlete_zones,
  lateral (values ('ftp_w', ftp_w::numeric), ('threshold_speed_mps', threshold_speed_mps), ('max_hr', max_hr::numeric)) x(f, v)
where v is not null
on conflict do nothing;

-- ---------------------------------------------------------------- goals (coach-set)
create table public.athlete_goals (
  athlete_id      uuid primary key references public.profiles (id) on delete cascade,
  race_name       text check (race_name is null or length(btrim(race_name)) between 1 and 80),
  race_date       date,
  block_name      text check (block_name is null or length(btrim(block_name)) between 1 and 60),
  block_ends      date,
  updated_at      timestamptz not null default now()
);
alter table public.athlete_goals enable row level security;
create policy "athlete_goals: read" on public.athlete_goals for select to authenticated using (public.can_see_athlete(athlete_id));
create policy "athlete_goals: coach writes" on public.athlete_goals for insert to authenticated with check (public.is_coach_of(athlete_id));
create policy "athlete_goals: coach updates" on public.athlete_goals for update to authenticated
  using (public.is_coach_of(athlete_id)) with check (public.is_coach_of(athlete_id));
create policy "athlete_goals: coach deletes" on public.athlete_goals for delete to authenticated using (public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.athlete_goals to authenticated;

-- ---------------------------------------------------------------- achievements (server-written)
create table public.achievements (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  key          text not null check (key ~ '^[a-z0-9_:]{1,60}$'),  -- e.g. pr_5k, pr_power_20m, longest_run, consistency_4w
  value        numeric,            -- seconds, meters, watts... per key
  activity_id  uuid references public.activities (id) on delete set null,
  achieved_at  timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (athlete_id, key, achieved_at)
);
create index achievements_athlete on public.achievements (athlete_id, achieved_at desc);
alter table public.achievements enable row level security;
create policy "achievements: read" on public.achievements for select to authenticated using (public.can_see_athlete(athlete_id));
grant select on public.achievements to authenticated;

alter table public.activity_details add column bests jsonb;

revoke all on function public.shares_pod_with(uuid) from public, anon;
grant execute on function public.shares_pod_with(uuid) to authenticated;

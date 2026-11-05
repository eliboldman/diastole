-- Muscles worked per workout (the segmented avatar).
--
-- * activity_strain.auto: the server's estimate from the workout's demands (sport pattern x load,
--   or logged strength sets), as {region: level 1..3}. Written by the server only.
-- * activity_strain.custom: the athlete's (or coach's) own map, which wins when set. Changed only
--   through set_activity_strain(), which checks the regions and levels.
-- * reviewed_at: when the athlete confirmed or edited it (the Today prompt stops asking).
-- * activity_details.strength_sets: logged sets from the watch file (exercise category, reps, weight).
-- Visibility follows workout details: the athlete, their coach, and opted-in pod mates.

create table public.activity_strain (
  activity_id  uuid primary key references public.activities (id) on delete cascade,
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  auto         jsonb not null default '{}',
  custom       jsonb,
  reviewed_at  timestamptz,
  updated_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now()
);
create index activity_strain_athlete on public.activity_strain (athlete_id, updated_at desc);
alter table public.activity_strain enable row level security;
create policy "activity_strain: read" on public.activity_strain for select to authenticated
  using (public.can_view_workout_details(athlete_id));
grant select on public.activity_strain to authenticated;

alter table public.activity_details add column strength_sets jsonb;

-- Regions the app knows; anything else is refused.
create or replace function private.valid_strain(p jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_each(p) e
      where e.key not in ('traps', 'shoulders', 'chest', 'upper_back', 'lats', 'biceps', 'triceps', 'forearms', 'abs', 'obliques',
                          'lower_back', 'hip_flexors', 'glutes', 'adductors', 'quads', 'hamstrings', 'calves', 'shins')
         or jsonb_typeof(e.value) <> 'number' or (e.value)::text::numeric not in (1, 2, 3)
    );
$$;

-- The athlete or their coach saves a custom map (null goes back to the estimate) or just confirms it.
create or replace function public.set_activity_strain(p_activity uuid, p_custom jsonb, p_reviewed boolean default true)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid;
begin
  select athlete_id into owner from public.activities where id = p_activity;
  if owner is null or not (owner = auth.uid() or public.is_coach_of(owner)) then return 'You can''t change that workout.'; end if;
  if p_custom is not null and not private.valid_strain(p_custom) then return 'Unknown muscle or level.'; end if;
  insert into public.activity_strain (activity_id, athlete_id, custom, reviewed_at, updated_by)
  values (p_activity, owner, p_custom, case when p_reviewed then now() end, auth.uid())
  on conflict (activity_id) do update
    set custom = excluded.custom,
        reviewed_at = case when p_reviewed then now() else public.activity_strain.reviewed_at end,
        updated_by = auth.uid(), updated_at = now();
  return null;
end;
$$;
revoke all on function public.set_activity_strain(uuid, jsonb, boolean) from public, anon;
grant execute on function public.set_activity_strain(uuid, jsonb, boolean) to authenticated;

-- Workout stats view: richer activity summaries, per-activity detail (streams, laps, trimmed route),
-- per-athlete training zones, the link from a completed activity to the planned workout it fulfilled,
-- and opt-in sharing of workout details between pod members.

-- ---------------------------------------------------------------- activity summaries
alter table public.activities
  add column name               text,
  add column calories           numeric,
  add column elevation_gain_m   numeric,
  add column elevation_loss_m   numeric,
  add column avg_speed_mps      numeric,
  add column max_speed_mps      numeric,
  add column avg_power          numeric,
  add column max_power          numeric,
  add column normalized_power   numeric,
  add column avg_cadence        numeric,   -- steps/min for foot sports, rpm for cycling
  add column device             text,
  add column planned_workout_id uuid references public.planned_workouts (id) on delete set null;
create index activities_planned on public.activities (planned_workout_id) where planned_workout_id is not null;

-- ---------------------------------------------------------------- detail (from FIT files or Apple Health)
-- Streams are resampled to a few seconds; the route has points near the start and finish removed
-- so home addresses are never stored.
create table public.activity_details (
  activity_id   uuid primary key references public.activities (id) on delete cascade,
  athlete_id    uuid not null references public.profiles (id) on delete cascade,
  source        text not null check (source in ('garmin_fit', 'garmin_export_fit', 'apple')),
  streams       jsonb not null,
  laps          jsonb not null default '[]',
  route         jsonb,
  record_fields text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index activity_details_athlete on public.activity_details (athlete_id);
alter table public.activity_details enable row level security;

-- ---------------------------------------------------------------- zones (coach-set; blanks fall back to estimates)
create table public.athlete_zones (
  athlete_id            uuid primary key references public.profiles (id) on delete cascade,
  max_hr                integer check (max_hr between 120 and 230),
  threshold_speed_mps   numeric check (threshold_speed_mps between 1 and 10),   -- running threshold pace
  ftp_w                 integer check (ftp_w between 50 and 600),
  updated_at            timestamptz not null default now()
);
alter table public.athlete_zones enable row level security;

-- ---------------------------------------------------------------- pod sharing of workout details (opt-in)
alter table public.profiles add column share_workout_details boolean not null default false;

-- True when the signed-in user may see this athlete's workout details: their own, their coach,
-- or a fellow active pod member when BOTH have opted in.
create or replace function public.can_view_workout_details(owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select owner = auth.uid()
    or public.is_coach_of(owner)
    or (
      exists (select 1 from public.profiles o where o.id = owner and o.share_workout_details)
      and exists (select 1 from public.profiles me where me.id = auth.uid() and me.share_workout_details)
      and exists (
        select 1
        from public.pod_members a
        join public.pod_members b on b.pod_id = a.pod_id
        where a.athlete_id = owner and a.status = 'active'
          and b.athlete_id = auth.uid() and b.status = 'active'
      )
    );
$$;

-- The athlete flips their own switch; nothing else on the profile changes.
create or replace function public.set_share_workout_details(p_share boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles set share_workout_details = coalesce(p_share, false) where id = auth.uid();
$$;
revoke execute on function public.set_share_workout_details(boolean) from public, anon;
grant execute on function public.set_share_workout_details(boolean) to authenticated;

-- ---------------------------------------------------------------- policies
-- Existing "activities: read" (athlete + coach) stays; this adds opted-in pod mates.
create policy "activities: pod details read" on public.activities for select to authenticated
  using (public.can_view_workout_details(athlete_id));

create policy "activity_details: read" on public.activity_details for select to authenticated
  using (public.can_view_workout_details(athlete_id));
-- Writes come from the server (service role) only for now; the iPhone app gets its own policy later.

create policy "athlete_zones: read" on public.athlete_zones for select to authenticated
  using (public.can_view_workout_details(athlete_id));
create policy "athlete_zones: coach insert" on public.athlete_zones for insert to authenticated
  with check (public.is_coach_of(athlete_id) or (athlete_id = auth.uid() and public.is_coach()));
create policy "athlete_zones: coach update" on public.athlete_zones for update to authenticated
  using (public.is_coach_of(athlete_id) or (athlete_id = auth.uid() and public.is_coach()))
  with check (public.is_coach_of(athlete_id) or (athlete_id = auth.uid() and public.is_coach()));

-- ---------------------------------------------------------------- pod feed: activity ids + whether details open
-- Same as before, plus each activity's id and a per-member "details" flag (true when the caller may open
-- that member's workout details under the sharing rules above).
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
      'readiness', (
        select jsonb_build_object('date', r.date, 'overall', r.overall, 'recovery', r.recovery, 'sleep', r.sleep,
                                  'stress', r.stress, 'load', r.load, 'note', r.note)
        from public.readiness_scores r where r.athlete_id = p.id order by r.date desc limit 1),
      'wellness', coalesce((
        select jsonb_agg(jsonb_build_object('date', w.date, 'hrv_ms', w.hrv_ms, 'resting_hr', w.resting_hr,
                                            'sleep_seconds', w.sleep_seconds, 'stress_avg', w.stress_avg,
                                            'body_battery_high', w.body_battery_high) order by w.date)
        from public.daily_wellness w where w.athlete_id = p.id and w.date >= current_date - 14), '[]'::jsonb),
      'activities', coalesce((
        select jsonb_agg(a order by a->>'start_time' desc) from (
          select jsonb_build_object('id', x.id, 'sport', x.sport, 'start_time', x.start_time, 'duration_s', x.duration_s,
                                    'distance_m', x.distance_m, 'avg_hr', x.avg_hr) a
          from public.activities x where x.athlete_id = p.id order by x.start_time desc limit 10) acts), '[]'::jsonb)
    ) m
    from public.pod_members pm
    join public.profiles p on p.id = pm.athlete_id
    where pm.pod_id = p_pod and pm.status = 'active'
  ) members;

  return result;
end;
$$;

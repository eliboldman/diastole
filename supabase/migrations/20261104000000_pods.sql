-- Pods: coach-created groups whose members, once they opt in, see each other's training
-- snapshots (activities, readiness, wellness numbers). Membership is per pod and revocable.
--
-- No base-table policies change. Pod data is served only by get_pod_feed(), which checks
-- on every call that the caller and each member have accepted the same pod.

create type public.pod_member_status as enum ('invited', 'active', 'declined', 'left');

create table public.pods (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  created_at  timestamptz not null default now()
);

create table public.pod_members (
  pod_id        uuid not null references public.pods (id) on delete cascade,
  athlete_id    uuid not null references public.profiles (id) on delete cascade,
  status        public.pod_member_status not null default 'invited',
  invited_at    timestamptz not null default now(),
  responded_at  timestamptz,
  primary key (pod_id, athlete_id)
);
create index pod_members_athlete on public.pod_members (athlete_id);

alter table public.pods enable row level security;
alter table public.pod_members enable row level security;

-- ---------------------------------------------------------------- helpers

create or replace function public.is_pod_coach(p_pod uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.pods where id = p_pod and coach_id = auth.uid()); $$;

create or replace function public.my_pod_status(p_pod uuid)
returns public.pod_member_status
language sql stable security definer set search_path = ''
as $$ select status from public.pod_members where pod_id = p_pod and athlete_id = auth.uid(); $$;

-- ---------------------------------------------------------------- policies

-- pods: the coach manages their own; invited/active members can see the pod's name.
create policy "pods: coach manages" on public.pods for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and public.is_coach());
create policy "pods: members read" on public.pods for select to authenticated
  using (public.my_pod_status(id) in ('invited', 'active'));

-- pod_members: the coach adds/removes their own athletes; athletes see their own row,
-- and active members see the other active members (names come from get_pod_feed).
create policy "pod_members: coach reads" on public.pod_members for select to authenticated
  using (public.is_pod_coach(pod_id));
create policy "pod_members: coach adds own athletes" on public.pod_members for insert to authenticated
  with check (public.is_pod_coach(pod_id) and public.is_coach_of(athlete_id) and status = 'invited');
create policy "pod_members: coach removes" on public.pod_members for delete to authenticated
  using (public.is_pod_coach(pod_id));
create policy "pod_members: own row" on public.pod_members for select to authenticated
  using (athlete_id = auth.uid());
create policy "pod_members: active members see each other" on public.pod_members for select to authenticated
  using (status = 'active' and public.my_pod_status(pod_id) = 'active');

-- Re-inviting someone who declined or left: the coach resets their row to 'invited'.
-- Returns true if a row was re-invited.
create or replace function public.reinvite_to_pod(p_pod uuid, p_athlete uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_pod_coach(p_pod) then return false; end if;
  update public.pod_members set status = 'invited', invited_at = now(), responded_at = null
   where pod_id = p_pod and athlete_id = p_athlete and status in ('declined', 'left');
  return found;
end;
$$;

-- Athlete's own decision: accept / decline an invite, or leave.
-- Returns the new status, or null if that change isn't allowed (no invite, wrong state).
create or replace function public.respond_to_pod(p_pod uuid, p_action text)
returns public.pod_member_status
language plpgsql security definer set search_path = ''
as $$
declare
  current_status public.pod_member_status;
  next_status public.pod_member_status;
begin
  select status into current_status from public.pod_members where pod_id = p_pod and athlete_id = auth.uid();
  if current_status is null then return null; end if;

  next_status := case
    when p_action = 'accept'  and current_status = 'invited' then 'active'
    when p_action = 'decline' and current_status = 'invited' then 'declined'
    when p_action = 'leave'   and current_status = 'active'  then 'left'
  end;
  if next_status is null then return null; end if;

  update public.pod_members set status = next_status, responded_at = now()
   where pod_id = p_pod and athlete_id = auth.uid();
  return next_status;
end;
$$;

-- The pod feed. Returns null unless the caller is an active member (or the pod's coach).
-- Includes only members who are themselves active. Names only — no emails.
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
          select jsonb_build_object('sport', x.sport, 'start_time', x.start_time, 'duration_s', x.duration_s,
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

revoke all on function public.get_pod_feed(uuid) from public, anon;
revoke all on function public.respond_to_pod(uuid, text) from public, anon;
revoke all on function public.reinvite_to_pod(uuid, uuid) from public, anon;
grant execute on function public.get_pod_feed(uuid) to authenticated;
grant execute on function public.respond_to_pod(uuid, text) to authenticated;
grant execute on function public.reinvite_to_pod(uuid, uuid) to authenticated;

-- Weekly coach digest, "pack tonight" pushes, shoe mileage, and pod challenges.

-- ---------------------------------------------------------------- notifications
-- New kinds: weekly_digest (coach), workout_pack and workout_shoes (athlete; grouped with
-- workouts by their prefix), pod_challenge (pod members).
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated', 'weekly_digest', 'workout_pack', 'workout_shoes', 'pod_challenge'));

create or replace function private.notify_group(p_kind text, p_meta jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_kind = 'pod_props' and coalesce((p_meta ->> 'comment')::boolean, false) then 'comments'
    when p_kind = 'pod_props' then 'props'
    when p_kind = 'message' then 'messages'
    when p_kind in ('pod_invite', 'pod_answer', 'pod_challenge') then 'pods'
    when p_kind like 'workout\_%' then 'workouts'
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined', 'checkin_pain', 'briefs_ready', 'safety_note', 'zones_updated', 'weekly_digest') then 'coaching'
    else null end;
$$;

-- Scheduled jobs (service role) send notifications through the same path as the triggers:
-- dedupe keys, test athletes skipped, the athlete's notification settings respected.
create or replace function public.server_notify(p_user uuid, p_kind text, p_title text, p_body text, p_href text, p_key text)
returns void
language sql security definer set search_path = ''
as $$ select private.notify(p_user, p_kind, p_title, p_body, p_href, p_key, '{}'::jsonb, null); $$;
revoke all on function public.server_notify(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.server_notify(uuid, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------- shoe mileage
-- Which shoes a run was in (shoe ids live in athlete_gear.gear.shoes). Runs without a row count
-- toward the athlete's default shoe.
create table public.activity_shoes (
  activity_id  uuid primary key references public.activities (id) on delete cascade,
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  shoe_id      text not null check (shoe_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  created_at   timestamptz not null default now()
);
create index activity_shoes_athlete on public.activity_shoes (athlete_id);
alter table public.activity_shoes enable row level security;
create policy "activity_shoes: athlete or coach" on public.activity_shoes for all to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
  with check (
    (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
    and exists (select 1 from public.activities a where a.id = activity_id and a.athlete_id = activity_shoes.athlete_id)
  );
grant select, insert, update, delete on public.activity_shoes to authenticated;

-- ---------------------------------------------------------------- pod challenges
-- A pod goal everyone builds together ("team") or a leaderboard ("leaderboard"). Members opt in
-- by joining; only joined members' totals are counted or shown, whatever their sharing level.
create table public.pod_challenges (
  id          uuid primary key default gen_random_uuid(),
  pod_id      uuid not null references public.pods (id) on delete cascade,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 80),
  metric      text not null check (metric in ('hours', 'distance', 'sessions')),
  sport       text not null default 'any' check (sport in ('any', 'run', 'bike', 'swim')),
  mode        text not null check (mode in ('team', 'leaderboard')),
  goal        numeric check (goal is null or goal > 0),  -- hours, km or sessions; required for team
  starts_on   date not null,
  ends_on     date not null,
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 92),
  check (mode <> 'team' or goal is not null)
);
create index pod_challenges_pod on public.pod_challenges (pod_id, ends_on desc);

create table public.pod_challenge_entries (
  challenge_id  uuid not null references public.pod_challenges (id) on delete cascade,
  athlete_id    uuid not null references public.profiles (id) on delete cascade,
  joined_at     timestamptz not null default now(),
  primary key (challenge_id, athlete_id)
);

-- Can the caller take part in or see this pod: its coach or an active member.
create or replace function public.in_pod(p_pod uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.is_pod_coach(p_pod) or public.my_pod_status(p_pod) = 'active'; $$;
revoke all on function public.in_pod(uuid) from public, anon;
grant execute on function public.in_pod(uuid) to authenticated;

alter table public.pod_challenges enable row level security;
create policy "pod_challenges: pod reads" on public.pod_challenges for select to authenticated using (public.in_pod(pod_id));
create policy "pod_challenges: pod creates" on public.pod_challenges for insert to authenticated
  with check (created_by = auth.uid() and public.in_pod(pod_id));
create policy "pod_challenges: creator or coach removes" on public.pod_challenges for delete to authenticated
  using (created_by = auth.uid() or public.is_pod_coach(pod_id));
grant select, insert, delete on public.pod_challenges to authenticated;

alter table public.pod_challenge_entries enable row level security;
create policy "challenge_entries: pod reads" on public.pod_challenge_entries for select to authenticated
  using (exists (select 1 from public.pod_challenges c where c.id = challenge_id and public.in_pod(c.pod_id)));
-- Only active members join (the coach organizes); only yourself.
create policy "challenge_entries: join" on public.pod_challenge_entries for insert to authenticated
  with check (athlete_id = auth.uid() and exists (
    select 1 from public.pod_challenges c where c.id = challenge_id and public.my_pod_status(c.pod_id) = 'active' and c.ends_on >= current_date - 1));
create policy "challenge_entries: leave" on public.pod_challenge_entries for delete to authenticated using (athlete_id = auth.uid());
grant select, insert, delete on public.pod_challenge_entries to authenticated;

-- Challenges in a pod (active, upcoming, and ended in the last 14 days) with each joined member's
-- total. Days count in each athlete's own timezone. Only joined members appear.
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
          -- still in the pod (or the pod's coach)
          and (exists (select 1 from public.pod_members m where m.pod_id = c.pod_id and m.athlete_id = e.athlete_id and m.status = 'active'))
      ), '[]'::jsonb)
    ) as row
    from public.pod_challenges c
    left join public.profiles cp on cp.id = c.created_by
    where c.pod_id = p_pod and public.in_pod(p_pod) and c.ends_on >= current_date - 14
  ) s;
$$;
revoke all on function public.get_pod_challenges(uuid) from public, anon;
grant execute on function public.get_pod_challenges(uuid) to authenticated;

-- A new challenge: tell the pod (everyone but its creator).
create or replace function private.notify_pod_challenge()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  pod_name text;
  who text;
  m record;
begin
  select name into pod_name from public.pods where id = new.pod_id;
  select coalesce(nullif(split_part(full_name, ' ', 1), ''), 'Someone') into who from public.profiles where id = new.created_by;
  for m in
    select athlete_id as uid, false as coach from public.pod_members where pod_id = new.pod_id and status = 'active'
    union select coach_id, true from public.pods where id = new.pod_id
  loop
    perform private.notify(m.uid, 'pod_challenge', left(who || ' started a challenge in ' || coalesce(pod_name, 'your pod'), 200),
      new.title || ' · ' || to_char(new.starts_on, 'Mon DD') || '–' || to_char(new.ends_on, 'Mon DD') || case when m.coach then '' else '. Tap to join.' end,
      case when m.coach then '/pods/' else '/me/pods/' end || new.pod_id || '?view=challenges', 'challenge:' || new.id, '{}'::jsonb, new.created_by);
  end loop;
  return new;
end;
$$;
create trigger pod_challenge_notify after insert on public.pod_challenges for each row execute function private.notify_pod_challenge();

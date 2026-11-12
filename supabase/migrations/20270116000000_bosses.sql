-- Weakness bosses. Each month rules suggest one limiter per athlete; the coach approves, swaps or
-- skips. Athletes only ever see approved bosses, and only the athlete and their coach see them
-- (never pods). Written by the server after its checks.

create table public.bosses (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  coach_id     uuid not null references public.profiles (id) on delete cascade,
  month        date not null,                       -- first of the month
  limiter      text not null check (limiter in ('fade', 'climbing', 'swim', 'consistency')),
  status       text not null check (status in ('suggested', 'active', 'defeated', 'skipped', 'escaped')),
  evidence     text check (evidence is null or length(evidence) <= 300),
  baseline     numeric,
  current      numeric,
  hp           integer not null default 100 check (hp between 20 and 500),
  approved_at  timestamptz,
  defeated_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (athlete_id, month)
);
create index bosses_coach on public.bosses (coach_id, month desc);
alter table public.bosses enable row level security;
create policy "bosses: coach reads" on public.bosses for select to authenticated using (public.is_coach_of(athlete_id));
create policy "bosses: athlete reads approved" on public.bosses for select to authenticated
  using (athlete_id = auth.uid() and status in ('active', 'defeated', 'escaped'));
grant select on public.bosses to authenticated;

create table public.boss_hits (
  boss_id     uuid not null references public.bosses (id) on delete cascade,
  kind        text not null check (kind in ('session', 'bonus')),
  ref         text not null check (length(ref) between 1 and 80),
  amount      integer not null check (amount between 0 and 200),
  label       text check (label is null or length(label) <= 120),
  created_at  timestamptz not null default now(),
  primary key (boss_id, kind, ref)
);
alter table public.boss_hits enable row level security;
create policy "boss hits: whoever sees the boss" on public.boss_hits for select to authenticated
  using (exists (select 1 from public.bosses b where b.id = boss_id));
grant select on public.boss_hits to authenticated;

-- Sessions the coach aims at this month's boss.
alter table public.planned_workouts add column targets_boss boolean not null default false;

-- Notification kinds for the engagement features (bosses, pod baton, campfire, storylines, posters).
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated', 'weekly_digest', 'workout_pack', 'workout_shoes', 'pod_challenge', 'workout_recap', 'monthly_digest',
  'workout_request', 'workout_declined', 'workout_recovery', 'plan_change', 'workout_changed',
  'zone_suggestion', 'session_missed', 'bedtime_recap', 'swim_video',
  'boss_suggested', 'boss', 'baton', 'campfire', 'storyline', 'poster'));

create or replace function private.notify_group(p_kind text, p_meta jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_kind = 'pod_props' and coalesce((p_meta ->> 'comment')::boolean, false) then 'comments'
    when p_kind = 'pod_props' then 'props'
    when p_kind = 'message' then 'messages'
    when p_kind in ('pod_invite', 'pod_answer', 'pod_challenge', 'baton', 'campfire', 'storyline') then 'pods'
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined', 'checkin_pain', 'briefs_ready', 'safety_note', 'zones_updated', 'weekly_digest', 'monthly_digest', 'workout_request', 'plan_change', 'zone_suggestion', 'session_missed', 'boss_suggested') then 'coaching'
    when p_kind = 'bedtime_recap' then 'sleep'
    when p_kind like 'workout\_%' then 'workouts'
    else null end;
$$;

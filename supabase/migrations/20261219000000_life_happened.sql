-- Phase P: "Life happened" plan changes, sick/injured mode, duplicate activity merges, and the
-- heat/altitude opt-in. Writes go through server actions (service role) after their checks.

-- ---------------------------------------------------------------- plan changes
-- reason: minutes | feeling_off | missed | cant_today | return (back from sick/injured).
-- proposal: {"action": "steps", "steps": [...]} | {"action": "move", "date": "..."} | {"action": "skip"}
--           | {"action": "ramp", "workouts": [{"date", "title", "sport", "steps"}]}.
-- status: auto (small, already applied) | pending (waits for the coach) | approved | declined.
create table public.plan_changes (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  coach_id    uuid references public.profiles (id) on delete cascade,
  workout_id  uuid references public.planned_workouts (id) on delete cascade,
  reason      text not null check (reason in ('minutes', 'feeling_off', 'missed', 'cant_today', 'return')),
  summary     text not null check (length(summary) <= 200),
  why         text check (why is null or length(why) <= 400),
  proposal    jsonb,
  status      text not null check (status in ('auto', 'pending', 'approved', 'declined')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index plan_changes_coach on public.plan_changes (coach_id, status, created_at desc);
create index plan_changes_athlete on public.plan_changes (athlete_id, created_at desc);
alter table public.plan_changes enable row level security;
create policy "plan changes: athlete or coach reads" on public.plan_changes for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select on public.plan_changes to authenticated;

-- ---------------------------------------------------------------- sick / injured
-- {"kind": "sick" | "injured", "since": "YYYY-MM-DD", "note": "..."}; null = training normally.
alter table public.profiles add column health_pause jsonb
  check (health_pause is null or (jsonb_typeof(health_pause) = 'object' and health_pause ->> 'kind' in ('sick', 'injured') and length(health_pause::text) < 600));

create table public.symptom_logs (
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  date        date not null,
  symptoms    text[] not null default '{}' check (cardinality(symptoms) <= 12),
  energy      smallint check (energy between 1 and 5),
  note        text check (note is null or length(note) <= 300),
  created_at  timestamptz not null default now(),
  primary key (athlete_id, date)
);
alter table public.symptom_logs enable row level security;
create policy "symptoms: athlete manages own" on public.symptom_logs for all to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy "symptoms: coach reads" on public.symptom_logs for select to authenticated
  using (public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.symptom_logs to authenticated;

-- ---------------------------------------------------------------- duplicate activities
-- The same session from two sources: the existing record is kept and gaps are filled from the new
-- one; the new row is set aside here (whole) so the athlete can undo. One row per source record,
-- so a re-sync of a set-aside copy is recognised; undone_at = the athlete wants both kept.
create table public.activity_merges (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references public.profiles (id) on delete cascade,
  kept_id         uuid not null references public.activities (id) on delete cascade,
  source          text not null,
  external_id     text not null,
  row             jsonb not null,
  filled          jsonb not null default '{}',   -- the kept record's previous values for filled fields
  moved_details   boolean not null default false,
  created_at      timestamptz not null default now(),
  undone_at       timestamptz,
  unique (source, external_id)
);
create index activity_merges_kept on public.activity_merges (kept_id);
alter table public.activity_merges enable row level security;
create policy "merges: athlete or coach reads" on public.activity_merges for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select on public.activity_merges to authenticated;

-- ---------------------------------------------------------------- heat and altitude (opt-in)
alter table public.profiles add column adjust_conditions boolean not null default false;
grant update (adjust_conditions) on public.profiles to authenticated;

-- ---------------------------------------------------------------- notifications
-- plan_change: an athlete's change for the coach (coaching). workout_changed: the result for the athlete.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated', 'weekly_digest', 'workout_pack', 'workout_shoes', 'pod_challenge', 'workout_recap', 'monthly_digest',
  'workout_request', 'workout_declined', 'workout_recovery', 'plan_change', 'workout_changed'));

create or replace function private.notify_group(p_kind text, p_meta jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_kind = 'pod_props' and coalesce((p_meta ->> 'comment')::boolean, false) then 'comments'
    when p_kind = 'pod_props' then 'props'
    when p_kind = 'message' then 'messages'
    when p_kind in ('pod_invite', 'pod_answer', 'pod_challenge') then 'pods'
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined', 'checkin_pain', 'briefs_ready', 'safety_note', 'zones_updated', 'weekly_digest', 'monthly_digest', 'workout_request', 'plan_change') then 'coaching'
    when p_kind like 'workout\_%' then 'workouts'
    else null end;
$$;

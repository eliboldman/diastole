-- AI-suggested training blocks (coach), the coach's coaching guide, private per-athlete coaching
-- notes, and each athlete's preferred week (which disciplines on which days).

-- The coach's philosophy, used for every suggested workout. Coach-only (coach_settings RLS).
alter table public.coach_settings add column philosophy text check (philosophy is null or char_length(philosophy) <= 20000);

-- Private notes about one athlete (goal, period, constraints). Only their coach reads or writes them;
-- the athlete never sees them. Kept per athlete so one athlete's numbers never reach another's plan.
create table public.athlete_coaching (
  athlete_id  uuid primary key references public.profiles (id) on delete cascade,
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  notes       text not null default '' check (char_length(notes) <= 8000),
  updated_at  timestamptz not null default now()
);
alter table public.athlete_coaching enable row level security;
create policy "athlete_coaching: their coach" on public.athlete_coaching for all to authenticated
  using (coach_id = auth.uid() and public.is_coach_of(athlete_id))
  with check (coach_id = auth.uid() and public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.athlete_coaching to authenticated;

-- The athlete's preferred week: {"mon": {"sports": ["swim"], "minutes": 60, "note": "pool before 7"}, ...}.
-- The athlete and their coach can both edit it.
create table public.athlete_week (
  athlete_id  uuid primary key references public.profiles (id) on delete cascade,
  days        jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);
alter table public.athlete_week enable row level security;
create policy "athlete_week: athlete or coach" on public.athlete_week for all to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
  with check (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.athlete_week to authenticated;

-- One "Suggest workouts" run: what the coach asked for and what came back (coach-only).
create table public.plan_batches (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  start_date  date not null,
  days        smallint not null check (days between 1 and 28),
  guidance    text check (guidance is null or char_length(guidance) <= 2000),
  summary     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index plan_batches_athlete on public.plan_batches (athlete_id, created_at desc);
alter table public.plan_batches enable row level security;
create policy "plan_batches: their coach" on public.plan_batches for all to authenticated
  using (coach_id = auth.uid() and public.is_coach_of(athlete_id))
  with check (coach_id = auth.uid() and public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.plan_batches to authenticated;

-- Suggested workouts are ordinary drafts tagged with their batch, so a block can be approved or
-- discarded together.
alter table public.planned_workouts add column plan_batch uuid references public.plan_batches (id) on delete set null;
create index planned_workouts_plan_batch on public.planned_workouts (plan_batch) where plan_batch is not null;

alter table public.ai_usage drop constraint ai_usage_trigger_check;
alter table public.ai_usage add constraint ai_usage_trigger_check check (trigger in ('cron', 'manual', 'test', 'form', 'why', 'brief', 'build', 'meal', 'plan'));

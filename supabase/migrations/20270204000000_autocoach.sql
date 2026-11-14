-- Self-coaching automation for athletes on an imported plan who coach themselves (lib/autocoach).
-- Nothing here changes a workout on its own: every change is a proposal the athlete approves.

-- Proposals: readiness swaps (make today's key session easy, or rest), moving a missed key session,
-- and resetting goal race pace after a checkpoint. payload holds the before/after needed to apply it.
create table public.coach_proposals (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('readiness_swap', 'reschedule', 'goal_pace')),
  workout_id uuid references public.planned_workouts (id) on delete cascade,
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'expired')),
  choice text,
  result text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  decided_at timestamptz
);
create index coach_proposals_athlete on public.coach_proposals (athlete_id, status, created_at desc);
alter table public.coach_proposals enable row level security;
create policy "athletes read their own proposals" on public.coach_proposals for select using (athlete_id = (select auth.uid()));
-- Writes go through the server (service role) after it checks the signed-in athlete owns the proposal.

-- Checkpoint results for a plan: each metric's value and lane, and the overall lane.
create table public.plan_checkpoints (
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  plan_id text not null,
  checkpoint int not null,
  results jsonb not null default '{}'::jsonb,
  lane text check (lane in ('3:55', '4:05', 'below')),
  evaluated_at timestamptz not null default now(),
  primary key (athlete_id, plan_id, checkpoint)
);
alter table public.plan_checkpoints enable row level security;
create policy "athletes read their own checkpoints" on public.plan_checkpoints for select using (athlete_id = (select auth.uid()));

-- The plan's threshold tests count as tests (zone suggestions can then lower a zone and settle the test).
update public.planned_workouts set test_kind = 'css'
  where plan_meta is not null and test_kind is null and sport = 'swim' and title ~* 'css' and title ~* 'test';
update public.planned_workouts set test_kind = 'run30'
  where plan_meta is not null and test_kind is null and sport = 'run' and title ~* '30-min run (time trial|tt)';
update public.planned_workouts set test_kind = 'ramp'
  where plan_meta is not null and test_kind is null and sport = 'bike' and title ~* 'ramp test';
update public.planned_workouts set test_kind = 'ftp20'
  where plan_meta is not null and test_kind is null and sport = 'bike' and title ~* '20-min ftp';

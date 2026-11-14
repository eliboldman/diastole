-- Race-weight goal (Eli, 2026-11-14): a weight log, a goal with a planned line, and weekly computed
-- state (expenditure estimate, deficits, guardrails). The target is then held as base weight after race day. Daily calorie and macro targets are computed
-- from these by lib/fuel/weight-plan.ts. Rules only, no AI.
--
-- Privacy: the athlete and their head coach only. Team dietitians are deliberately left out
-- (is_coach_of includes them), and none of this is ever visible to pods.

-- The athlete's own coach (role coach), without the dietitian extension of is_coach_of.
create or replace function public.is_head_coach_of(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p join public.profiles me on me.id = auth.uid()
     where p.id = target and p.coach_id = auth.uid() and me.role = 'coach'
  );
$$;
revoke all on function public.is_head_coach_of(uuid) from public, anon;
grant execute on function public.is_head_coach_of(uuid) to authenticated;

-- ---------------------------------------------------------------- weight log (one per local day)
create table public.body_weights (
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  date        date not null,
  weight_kg   numeric(5, 2) not null check (weight_kg between 25 and 250),
  source      text not null default 'manual' check (source in ('manual', 'apple', 'garmin')),
  created_at  timestamptz not null default now(),
  primary key (athlete_id, date)
);
alter table public.body_weights enable row level security;
create policy "body_weights: athlete or head coach reads" on public.body_weights for select to authenticated
  using (athlete_id = auth.uid() or public.is_head_coach_of(athlete_id));
create policy "body_weights: athlete adds" on public.body_weights for insert to authenticated
  with check (athlete_id = auth.uid());
create policy "body_weights: athlete edits" on public.body_weights for update to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy "body_weights: athlete deletes" on public.body_weights for delete to authenticated
  using (athlete_id = auth.uid());
grant select, insert, update, delete on public.body_weights to authenticated;

-- ---------------------------------------------------------------- the goal
-- line: the planned 7-day-average weight, [{"date": "YYYY-MM-DD", "kg": 80.74}, ...], interpolated between points.
-- target_date can be pushed later by the behind-the-line guardrail, never past latest_date.
-- Body inputs for the resting-metabolism estimate live here (not athlete_body, which dietitians can read).
create table public.weight_goals (
  id               uuid primary key default gen_random_uuid(),
  athlete_id       uuid not null references public.profiles (id) on delete cascade,
  height_cm        numeric(5, 1) not null check (height_cm between 120 and 230),
  age_years        smallint not null check (age_years between 14 and 90),
  age_on           date not null, -- the day age_years was true; age rolls forward from here
  sex              text not null check (sex in ('male', 'female')),
  activity_factor  numeric(3, 2) not null default 1.40 check (activity_factor between 1.1 and 2.0),
  start_date       date not null,
  start_kg         numeric(5, 2) not null check (start_kg between 25 and 250),
  target_kg        numeric(5, 2) not null check (target_kg between 25 and 250),
  target_date      date not null,
  original_date    date not null,
  latest_date      date not null,
  maintain_until   date not null, -- race day
  line             jsonb not null check (jsonb_typeof(line) = 'array' and jsonb_array_length(line) between 2 and 20),
  max_rate_lb_wk   numeric(3, 2) not null default 1.0 check (max_rate_lb_wk between 0.25 and 2),
  easy_deficit     integer not null default 500 check (easy_deficit between 0 and 600),
  moderate_deficit integer not null default 400 check (moderate_deficit between 0 and 600),
  -- How strictly the per-kg carb ranges bind when calories are tight (lib/fuel/weight-plan.ts Goal.carb_floor).
  carb_floor       text not null default 'fuel' check (carb_floor in ('fuel', 'key_range', 'range')),
  -- Deficit tiers (lib/fuel/weight-plan.ts dayDeficit). Test/race-sim days and the day before are always 0.
  key_deficit      integer not null default 400 check (key_deficit between 0 and 400),  -- ordinary key-session day
  pre_big_deficit  integer not null default 300 check (pre_big_deficit between 0 and 400), -- day before a long ride/run or brick
  big_deficit      integer not null default 300 check (big_deficit between 0 and 400),   -- long ride/run or brick day
  -- After race day the target is held as base weight; above target + this band (7-day avg), easy days get 250 kcal off.
  hold_band_lb     numeric(3, 1) not null default 2.0 check (hold_band_lb between 0.5 and 5),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (target_date between start_date and latest_date and latest_date <= maintain_until)
);
create unique index weight_goals_one_active on public.weight_goals (athlete_id) where active;
alter table public.weight_goals enable row level security;
create policy "weight_goals: athlete or head coach reads" on public.weight_goals for select to authenticated
  using (athlete_id = auth.uid() or public.is_head_coach_of(athlete_id));
grant select on public.weight_goals to authenticated;
-- No write policies: the goal is set up by script and adjusted by the server's guardrails.

-- ---------------------------------------------------------------- weekly computed state
-- One row per goal and Monday. Written by the evening job (service role) only.
-- guardrails: [{"rule": "fast_loss" | "stall" | "behind" | "performance" | "recovery" | "low_energy", "message": "..."}]
create table public.weight_goal_weeks (
  goal_id          uuid not null references public.weight_goals (id) on delete cascade,
  athlete_id       uuid not null references public.profiles (id) on delete cascade,
  week_start       date not null,
  avg_kg           numeric(5, 2),
  planned_kg       numeric(5, 2),
  rate_lb_wk       numeric(4, 2),
  baseline_kcal    integer not null,
  baseline_source  text not null check (baseline_source in ('estimate', 'measured')),
  easy_deficit     integer not null,
  moderate_deficit integer not null,
  pause_until      date,
  pause_reason     text check (char_length(pause_reason) <= 300),
  target_date      date not null,
  ftp_w            integer,
  guardrails       jsonb not null default '[]'::jsonb check (jsonb_typeof(guardrails) = 'array'),
  computed_at      timestamptz not null default now(),
  primary key (goal_id, week_start)
);
create index weight_goal_weeks_athlete on public.weight_goal_weeks (athlete_id, week_start desc);
alter table public.weight_goal_weeks enable row level security;
create policy "weight_goal_weeks: athlete or head coach reads" on public.weight_goal_weeks for select to authenticated
  using (athlete_id = auth.uid() or public.is_head_coach_of(athlete_id));
grant select on public.weight_goal_weeks to authenticated;

-- ---------------------------------------------------------------- weekly low-energy check-in
-- Four optional taps once a week. Kept out of symptom_logs, which dietitians can read.
create table public.energy_checkins (
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  week_start  date not null,
  fatigue     boolean not null default false,
  low_libido  boolean not null default false,
  ill         boolean not null default false,
  low_mood    boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (athlete_id, week_start)
);
alter table public.energy_checkins enable row level security;
create policy "energy_checkins: athlete manages own" on public.energy_checkins for all to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy "energy_checkins: head coach reads" on public.energy_checkins for select to authenticated
  using (public.is_head_coach_of(athlete_id));
grant select, insert, update, delete on public.energy_checkins to authenticated;

-- ---------------------------------------------------------------- the one guardrail that asks first
alter table public.coach_proposals drop constraint coach_proposals_kind_check;
alter table public.coach_proposals add constraint coach_proposals_kind_check
  check (kind in ('readiness_swap', 'reschedule', 'goal_pace', 'deficit_up'));

-- ---------------------------------------------------------------- notifications
-- 'autocoach' was never added (20270204), so those notifications were dropped by private.notify; fixed here.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated', 'weekly_digest', 'workout_pack', 'workout_shoes', 'pod_challenge', 'workout_recap', 'monthly_digest',
  'workout_request', 'workout_declined', 'workout_recovery', 'plan_change', 'workout_changed',
  'zone_suggestion', 'session_missed', 'bedtime_recap', 'swim_video',
  'boss_suggested', 'boss', 'baton', 'campfire', 'storyline', 'poster', 'refuel', 'refuel_staff',
  'device_stale', 'device_stale_coach', 'autocoach', 'weight_goal'));

create or replace function private.notify_group(p_kind text, p_meta jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_kind = 'pod_props' and coalesce((p_meta ->> 'comment')::boolean, false) then 'comments'
    when p_kind = 'pod_props' then 'props'
    when p_kind = 'message' then 'messages'
    when p_kind in ('pod_invite', 'pod_answer', 'pod_challenge', 'baton', 'campfire', 'storyline') then 'pods'
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined', 'checkin_pain', 'briefs_ready', 'safety_note', 'zones_updated', 'weekly_digest', 'monthly_digest', 'workout_request', 'plan_change', 'zone_suggestion', 'session_missed', 'boss_suggested', 'device_stale_coach', 'autocoach') then 'coaching'
    when p_kind = 'bedtime_recap' then 'sleep'
    when p_kind in ('refuel', 'refuel_staff', 'weight_goal') then 'fuel'
    when p_kind like 'workout\_%' then 'workouts'
    else null end;
$$;

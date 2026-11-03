-- AI coaching assistant (coach side only).
-- A morning job asks Claude about flagged athletes and stores suggestions here. Nothing reaches
-- an athlete until the coach approves a suggestion; athletes cannot read any of these tables.

create type public.suggestion_status as enum ('pending', 'approved', 'edited', 'dismissed');

create table public.coach_settings (
  coach_id            uuid primary key references public.profiles (id) on delete cascade,
  ai_enabled          boolean not null default true,
  ai_model            text not null default 'claude-opus-5-5'
                        check (ai_model in ('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5')),
  ai_monthly_cap_usd  numeric(8,2) not null default 5.00 check (ai_monthly_cap_usd >= 0),
  updated_at          timestamptz not null default now()
);

create table public.ai_suggestions (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid not null references public.profiles (id) on delete cascade,
  athlete_id         uuid not null references public.profiles (id) on delete cascade,
  date               date not null,                 -- athlete-local day it was made for
  overall            public.flag not null,          -- readiness flag at the time
  concern            text not null check (concern in ('low', 'medium', 'high')),
  summary            text not null,
  action             text not null check (action in ('keep', 'reduce_intensity', 'easy_session', 'rest', 'replace')),
  rationale          text not null,
  target_workout_id  uuid references public.planned_workouts (id) on delete set null, -- the planned session it changes
  proposed_workout   jsonb,                          -- {title, sport, scheduled_date, description, steps} or null
  status             public.suggestion_status not null default 'pending',
  result_workout_id  uuid references public.planned_workouts (id) on delete set null,
  usage_id           bigint,
  created_at         timestamptz not null default now(),
  decided_at         timestamptz,
  unique (athlete_id, date)
);
create index ai_suggestions_coach_date on public.ai_suggestions (coach_id, date desc);

create table public.ai_usage (
  id                    bigint generated always as identity primary key,
  coach_id              uuid not null references public.profiles (id) on delete cascade,
  model                 text not null,
  athletes              integer not null,
  input_tokens          integer not null,
  output_tokens         integer not null,
  cache_read_tokens     integer not null default 0,
  cache_write_tokens    integer not null default 0,
  cost_usd              numeric(10,5) not null,
  stop_reason           text,
  trigger               text not null default 'cron' check (trigger in ('cron', 'manual')),
  created_at            timestamptz not null default now()
);
create index ai_usage_coach_month on public.ai_usage (coach_id, created_at desc);

alter table public.coach_settings enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.ai_usage enable row level security;

-- Coach-only. The server (service role) writes suggestions and usage.
create policy "coach_settings: coach manages own" on public.coach_settings for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid() and public.is_coach());
create policy "ai_suggestions: coach reads own" on public.ai_suggestions for select to authenticated
  using (coach_id = auth.uid());
create policy "ai_suggestions: coach decides" on public.ai_suggestions for update to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy "ai_usage: coach reads own" on public.ai_usage for select to authenticated
  using (coach_id = auth.uid());

-- Running form (Phase 1b): a compact per-run summary of running dynamics, and coach-only AI form
-- insights that suggest library workouts or drills when an issue shows up across several runs.

-- {v, moving_s, metrics: {cadence|gct|gct_bal|vo|vr|stride|power: {avg, first, last, n}}}.
-- An empty metrics object means "checked, nothing recorded". Same visibility as the rest of the row.
alter table public.activity_details add column form jsonb;

-- Form insights are a new kind of AI run, counted against the same monthly cap.
alter table public.ai_usage drop constraint ai_usage_trigger_check;
alter table public.ai_usage add constraint ai_usage_trigger_check check (trigger in ('cron', 'manual', 'test', 'form'));

create table public.form_insights (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles (id) on delete cascade,
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  issue_key    text not null,                 -- e.g. 'gct:level', 'cadence:fatigue'
  summary      text not null,                 -- for the coach, plain language
  evidence     text,                          -- the runs and numbers behind it
  drills       text[] not null default '{}',  -- short drill ideas (text only)
  picks        jsonb not null default '[]',   -- [{library_id, title, reason}] from the coach's own library
  status       text not null default 'pending' check (status in ('pending', 'added', 'dismissed')),
  added_ids    uuid[] not null default '{}',  -- drafts created from it (still need approve & send)
  usage_id     bigint,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);
create index form_insights_athlete on public.form_insights (athlete_id, created_at desc);
create index form_insights_coach_pending on public.form_insights (coach_id, status, created_at desc);

-- Coach-only: athletes never see these. The server writes them.
alter table public.form_insights enable row level security;
create policy "form_insights: coach reads own" on public.form_insights for select to authenticated
  using (coach_id = auth.uid());
create policy "form_insights: coach decides" on public.form_insights for update to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

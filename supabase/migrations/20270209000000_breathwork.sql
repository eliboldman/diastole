-- Breathwork (2026-11-23): guided breathing sessions and a seated CO2 hold check (lib/breath/plan.ts).
-- The athlete records them; they and their head coach can read them. Not shared with dietitians or pods.
create table public.breath_sessions (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('resonance', 'downshift', 'sigh', 'box', 'finder')),
  pace         numeric(3, 1) check (pace is null or pace between 3 and 12),  -- breaths per minute (finder: the pace picked)
  seconds      integer not null check (seconds between 1 and 7200),
  calm_before  smallint check (calm_before between 1 and 5),
  calm_after   smallint check (calm_after between 1 and 5),
  ratings      jsonb check (ratings is null or jsonb_typeof(ratings) = 'object'),  -- finder: {"6.5": 3, ...}
  local_date   date not null,
  local_hour   smallint not null check (local_hour between 0 and 23),
  created_at   timestamptz not null default now()
);
create index breath_sessions_athlete on public.breath_sessions (athlete_id, local_date desc);

create table public.breath_holds (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  taken_on    date not null,
  seconds     numeric(5, 1) not null check (seconds between 1 and 300),
  created_at  timestamptz not null default now()
);
create index breath_holds_athlete on public.breath_holds (athlete_id, taken_on desc);

alter table public.breath_sessions enable row level security;
alter table public.breath_holds enable row level security;

create policy "breath sessions: athlete or head coach reads" on public.breath_sessions for select to authenticated
  using (athlete_id = auth.uid() or public.is_head_coach_of(athlete_id));
create policy "breath sessions: athlete adds" on public.breath_sessions for insert to authenticated
  with check (athlete_id = auth.uid());
create policy "breath sessions: athlete deletes" on public.breath_sessions for delete to authenticated
  using (athlete_id = auth.uid());

create policy "breath holds: athlete or head coach reads" on public.breath_holds for select to authenticated
  using (athlete_id = auth.uid() or public.is_head_coach_of(athlete_id));
create policy "breath holds: athlete adds" on public.breath_holds for insert to authenticated
  with check (athlete_id = auth.uid());
create policy "breath holds: athlete deletes" on public.breath_holds for delete to authenticated
  using (athlete_id = auth.uid());

grant select, insert, delete on public.breath_sessions to authenticated;
grant select, insert, delete on public.breath_holds to authenticated;

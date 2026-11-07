-- Phase 9d + 11: races, race fueling tools and race week.
-- Races: the athlete or their coach can add and edit them. Pods never see them.
-- Sweat tests keep only the result (sweat rate); the weights used to work it out are never stored.

create table public.races (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references public.profiles (id) on delete cascade,
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  race_date     date not null,
  sport         text not null check (sport in ('run', 'bike', 'swim', 'tri', 'other')),
  distance_km   numeric check (distance_km is null or distance_km between 0.1 and 1000),
  goal_seconds  integer check (goal_seconds is null or goal_seconds between 60 and 172800),
  priority      text not null default 'A' check (priority in ('A', 'B', 'C')),
  notes         text check (notes is null or char_length(notes) <= 500),
  checklist     jsonb not null default '{}',  -- race-week items ticked off, {key: true}
  created_at    timestamptz not null default now()
);
create index races_athlete_date on public.races (athlete_id, race_date);
alter table public.races enable row level security;
create policy "races: athlete or coach" on public.races for all to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
  with check (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.races to authenticated;

create table public.sweat_tests (
  id               uuid primary key default gen_random_uuid(),
  athlete_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  tested_on        date not null,
  sweat_rate_ml_h  integer not null check (sweat_rate_ml_h between 100 and 4000),
  minutes          integer not null check (minutes between 20 and 600),
  temp_c           numeric check (temp_c is null or temp_c between -20 and 50),
  sport            text check (sport is null or sport in ('run', 'bike', 'swim', 'tri', 'other')),
  note             text check (note is null or char_length(note) <= 300),
  created_at       timestamptz not null default now()
);
create index sweat_tests_athlete on public.sweat_tests (athlete_id, tested_on desc);
alter table public.sweat_tests enable row level security;
create policy "sweat_tests: athlete writes" on public.sweat_tests for all to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy "sweat_tests: coach reads" on public.sweat_tests for select to authenticated
  using (public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.sweat_tests to authenticated;

create table public.gut_sessions (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  on_date         date not null,
  carbs_g_per_h   integer not null check (carbs_g_per_h between 0 and 150),
  minutes         integer check (minutes is null or minutes between 10 and 900),
  comfort         smallint not null check (comfort between 1 and 5),
  products        text check (products is null or char_length(products) <= 120),
  note            text check (note is null or char_length(note) <= 300),
  created_at      timestamptz not null default now()
);
create index gut_sessions_athlete on public.gut_sessions (athlete_id, on_date desc);
alter table public.gut_sessions enable row level security;
create policy "gut_sessions: athlete writes" on public.gut_sessions for all to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy "gut_sessions: coach reads" on public.gut_sessions for select to authenticated
  using (public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.gut_sessions to authenticated;

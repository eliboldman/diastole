-- Mobility screen (2026-11-18): eight quick tests, scored per side (lib/mobility/screen.ts). The athlete
-- takes it; they and their head coach can read it. Not shared with dietitians or pods.
create table public.mobility_screens (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  taken_on    date not null,
  answers     jsonb not null check (jsonb_typeof(answers) = 'object'),
  score       smallint not null check (score between 0 and 100),
  created_at  timestamptz not null default now()
);
create index mobility_screens_athlete on public.mobility_screens (athlete_id, taken_on desc);

alter table public.mobility_screens enable row level security;
create policy "mobility: athlete or head coach reads" on public.mobility_screens for select to authenticated
  using (athlete_id = auth.uid() or public.is_head_coach_of(athlete_id));
create policy "mobility: athlete adds" on public.mobility_screens for insert to authenticated
  with check (athlete_id = auth.uid());
create policy "mobility: athlete deletes" on public.mobility_screens for delete to authenticated
  using (athlete_id = auth.uid());
grant select, insert, delete on public.mobility_screens to authenticated;

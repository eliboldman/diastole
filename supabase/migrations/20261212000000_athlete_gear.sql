-- "My closet": the gear an athlete owns or can use (shoes, bikes, trainer, access). Used for
-- planning and for "What to pack" on each workout. Shape cleaned by lib/closet.ts.
create table public.athlete_gear (
  athlete_id  uuid primary key references public.profiles (id) on delete cascade,
  gear        jsonb not null default '{}' check (jsonb_typeof(gear) = 'object' and length(gear::text) < 12000),
  updated_at  timestamptz not null default now()
);
alter table public.athlete_gear enable row level security;
-- The athlete edits it; their coach can read and fix it (same as the preferred week).
create policy "athlete_gear: athlete or coach" on public.athlete_gear for all to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
  with check (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.athlete_gear to authenticated;

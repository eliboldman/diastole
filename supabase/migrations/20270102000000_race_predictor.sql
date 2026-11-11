-- Race predictor: daily snapshots of the estimates (for the trend), the coach's note on them, and the
-- athlete's choice to hide them. Estimates themselves are computed on the fly from training data.

create table public.race_prediction_snapshots (
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  date        date not null,
  key         text not null check (char_length(key) <= 40),
  seconds     integer not null check (seconds between 30 and 172800),
  primary key (athlete_id, date, key)
);
alter table public.race_prediction_snapshots enable row level security;
create policy "race_prediction_snapshots: athlete or coach reads" on public.race_prediction_snapshots for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select on public.race_prediction_snapshots to authenticated; -- written by the server

create table public.race_prediction_notes (
  athlete_id  uuid primary key references public.profiles (id) on delete cascade,
  note        text not null check (char_length(note) between 1 and 600),
  coach_id    uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.race_prediction_notes enable row level security;
create policy "race_prediction_notes: athlete reads" on public.race_prediction_notes for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
create policy "race_prediction_notes: coach writes" on public.race_prediction_notes for all to authenticated
  using (public.is_coach_of(athlete_id)) with check (public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.race_prediction_notes to authenticated;

alter table public.profiles add column hide_predictions boolean not null default false;

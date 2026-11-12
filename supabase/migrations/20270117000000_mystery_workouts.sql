-- Mystery workouts: the coach seals a workout; the athlete sees only sport, duration and gear until
-- they finish it (then it unseals with the coach's note), or until they choose to reveal it early.
alter table public.planned_workouts
  add column mystery boolean not null default false,
  add column mystery_note text check (mystery_note is null or length(mystery_note) <= 300),
  add column revealed_at timestamptz;

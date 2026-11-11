-- Race course rehearsal: a race's course (from a GPX file, processed into a profile), which leg it
-- is, the editable pacing plan, and course sessions linked back to their race.
alter table public.races
  add column course jsonb,
  add column course_leg text check (course_leg is null or course_leg in ('run', 'bike')),
  add column course_name text check (course_name is null or char_length(course_name) <= 120),
  add column pacing jsonb;
alter table public.planned_workouts add column race_id uuid references public.races (id) on delete set null;
create index planned_workouts_race on public.planned_workouts (race_id) where race_id is not null;

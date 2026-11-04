-- Swim workouts: the pool a workout is written for. Both null means "any pool" (Garmin shows the
-- distances as written). Run and bike workouts leave these null.

alter table public.planned_workouts
  add column pool_length numeric check (pool_length is null or pool_length between 10 and 100),
  add column pool_unit   text check (pool_unit is null or pool_unit in ('METER', 'YARD')),
  add constraint planned_workouts_pool_pair check ((pool_length is null) = (pool_unit is null));

alter table public.workout_library
  add column pool_length numeric check (pool_length is null or pool_length between 10 and 100),
  add column pool_unit   text check (pool_unit is null or pool_unit in ('METER', 'YARD')),
  add constraint workout_library_pool_pair check ((pool_length is null) = (pool_unit is null));

alter table public.workout_versions
  add column pool_length numeric,
  add column pool_unit   text;

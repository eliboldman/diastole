-- Brick workouts: a bike workout can carry a run off the bike, sent to Garmin as one multisport
-- workout (bike then run, with a transition). {"sport": "run", "steps": [...]} in the same step
-- format as `steps`. Only on bike workouts; everything else treats the row as the bike workout.

alter table public.planned_workouts
  add column brick jsonb,
  add constraint planned_workouts_brick_shape check (
    brick is null or (sport = 'bike' and jsonb_typeof(brick) = 'object' and brick ->> 'sport' = 'run' and jsonb_typeof(brick -> 'steps') = 'array')
  );

alter table public.workout_library
  add column brick jsonb,
  add constraint workout_library_brick_shape check (
    brick is null or (sport = 'bike' and jsonb_typeof(brick) = 'object' and brick ->> 'sport' = 'run' and jsonb_typeof(brick -> 'steps') = 'array')
  );

alter table public.workout_versions
  add column brick jsonb;

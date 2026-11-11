-- Threshold tests: a planned workout can be a test (20-min FTP, ramp, CSS 400+200, 30-min run).
-- When the athlete completes it, Diastole reads the new zone from the file and offers it to the
-- coach to apply (a test can lower a zone too). Nothing changes until the coach applies it.
alter table public.planned_workouts
  add column test_kind text check (test_kind is null or test_kind in ('ftp20', 'ramp', 'css', 'run30'));

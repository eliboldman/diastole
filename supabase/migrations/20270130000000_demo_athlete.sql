-- Demo athletes: a sample athlete with full data on a new coach's roster, so an invited coach can
-- try every screen (coach side and, by switching into it, the athlete side) without seeing anyone
-- real. demo_seeded_at on the coach makes it a one-time gift; is_demo marks the sample account.
alter table public.profiles add column is_demo boolean not null default false;
alter table public.profiles add column demo_seeded_at timestamptz;

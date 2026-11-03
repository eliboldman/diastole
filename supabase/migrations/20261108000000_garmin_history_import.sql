-- Garmin history import (Starter tier has no historical API access): athletes upload their
-- Garmin account export; the browser extracts only the needed files and the server maps them
-- into the same tables the live sync uses, marked source = 'garmin_export'.

alter type public.data_source add value if not exists 'garmin_export';

-- Daily metrics that only the export carries (the live push doesn't send them to Starter apps).
alter table public.daily_wellness
  add column vo2_max             numeric,
  add column training_readiness  integer;

create table public.history_imports (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  started_by   uuid references public.profiles (id) on delete set null,
  status       text not null default 'running' check (status in ('running', 'done', 'failed')),
  range        text not null default '12m' check (range in ('12m', 'all')),
  counts       jsonb not null default '{}',   -- {"sleep": 412, "wellness_days": 498, "activities": 238, ...}
  error        text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index history_imports_athlete on public.history_imports (athlete_id, created_at desc);

alter table public.history_imports enable row level security;
-- Read-only for the athlete and their coach; the server writes with the service key.
create policy "imports: read" on public.history_imports for select to authenticated
  using (public.can_see_athlete(athlete_id));

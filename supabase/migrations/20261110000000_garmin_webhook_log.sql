-- One row per Garmin push delivery, whatever the outcome, so a stalled feed (security review,
-- sharing toggles off, a bad secret) is visible long after Vercel's short-lived runtime logs.
-- Payloads themselves stay in garmin_raw; this table holds only delivery metadata.

create table public.garmin_webhook_log (
  id               bigint generated always as identity primary key,
  received_at      timestamptz not null default now(),
  host             text,                       -- which address Garmin hit (diastole.app or the legacy vercel.app)
  outcome          text not null check (outcome in ('ok', 'bad_key', 'bad_json', 'ingest_error')),
  counts           jsonb,                      -- items per summary type, e.g. {"dailies": 1}
  garmin_users     integer,                    -- distinct Garmin user ids in the push
  athletes_touched integer,                    -- of those, how many matched a connected athlete
  error            text check (error is null or length(error) <= 1000),
  duration_ms      integer
);
create index garmin_webhook_log_received on public.garmin_webhook_log (received_at desc);

alter table public.garmin_webhook_log enable row level security;

-- Coaches can read the log; only the server (service role) writes it.
create policy "coaches read webhook log" on public.garmin_webhook_log
  for select to authenticated using (public.is_coach());

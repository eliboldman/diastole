-- Garmin integration support.
--
-- Tokens stay in the private schema (not exposed over the API). The server reaches them
-- only through these functions, which are executable by service_role alone.

alter table private.garmin_tokens enable row level security;

-- Raw Garmin webhook payloads, kept so field mappings can be checked against real data.
-- No policies: only the server (service role) can read or write.
create table public.garmin_raw (
  id           bigint generated always as identity primary key,
  summary_type text not null,
  garmin_user  text,
  payload      jsonb not null,
  received_at  timestamptz not null default now()
);
alter table public.garmin_raw enable row level security;
create index garmin_raw_received on public.garmin_raw (received_at desc);

create or replace function public.save_garmin_tokens(
  p_athlete uuid, p_access text, p_refresh text, p_expires_at timestamptz
) returns void
language sql security definer set search_path = ''
as $$
  insert into private.garmin_tokens (athlete_id, access_token, refresh_token, expires_at, updated_at)
  values (p_athlete, p_access, p_refresh, p_expires_at, now())
  on conflict (athlete_id) do update
    set access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        updated_at = now();
$$;

create or replace function public.get_garmin_tokens(p_athlete uuid)
returns table (access_token text, refresh_token text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select access_token, refresh_token, expires_at from private.garmin_tokens where athlete_id = p_athlete;
$$;

create or replace function public.delete_garmin_tokens(p_athlete uuid)
returns void
language sql security definer set search_path = ''
as $$ delete from private.garmin_tokens where athlete_id = p_athlete; $$;

revoke all on function public.save_garmin_tokens(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_garmin_tokens(uuid) from public, anon, authenticated;
revoke all on function public.delete_garmin_tokens(uuid) from public, anon, authenticated;
grant execute on function public.save_garmin_tokens(uuid, text, text, timestamptz) to service_role;
grant execute on function public.get_garmin_tokens(uuid) to service_role;
grant execute on function public.delete_garmin_tokens(uuid) to service_role;

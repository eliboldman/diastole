-- intervals.icu: the bridge to Zwift and Rouvy. Approved bike workouts are posted to the athlete's
-- intervals.icu calendar, which forwards them to Zwift/Rouvy; finished rides come back the same way.
-- The athlete pastes their intervals.icu API key once. The key sits in the private schema (server
-- only), like Garmin's tokens.

-- What the athlete (and coach) can see about the connection. Written only by the server.
create table public.intervals_connections (
  athlete_id      uuid primary key references public.profiles (id) on delete cascade,
  icu_athlete_id  text not null check (icu_athlete_id ~ '^i?[0-9]{1,12}$'),
  icu_name        text check (icu_name is null or length(icu_name) <= 80),
  sync_ftp        boolean not null default true,   -- keep intervals.icu's FTP equal to Diastole's
  connected_at    timestamptz not null default now(),
  dirty_at        timestamptz,                     -- a workout or FTP changed since the last push
  pushed_at       timestamptz,
  pulled_at       timestamptz,
  last_error      text check (last_error is null or length(last_error) <= 300)
);
alter table public.intervals_connections enable row level security;
revoke all on public.intervals_connections from anon, authenticated;
grant select on public.intervals_connections to authenticated;
create policy "intervals: own or coach" on public.intervals_connections for select to authenticated
  using (athlete_id = auth.uid() or exists (select 1 from public.profiles p where p.id = athlete_id and p.coach_id = auth.uid()));

create table private.intervals_keys (
  athlete_id  uuid primary key references public.profiles (id) on delete cascade,
  api_key     text not null check (length(api_key) between 10 and 200)
);

-- The private schema isn't exposed over the API: the server reaches keys only through these.
create or replace function public.save_intervals_key(p_athlete uuid, p_key text)
returns void
language sql security definer set search_path = ''
as $$
  insert into private.intervals_keys (athlete_id, api_key) values (p_athlete, p_key)
  on conflict (athlete_id) do update set api_key = excluded.api_key;
$$;
create or replace function public.get_intervals_key(p_athlete uuid)
returns text
language sql stable security definer set search_path = ''
as $$ select api_key from private.intervals_keys where athlete_id = p_athlete; $$;
create or replace function public.delete_intervals_key(p_athlete uuid)
returns void
language sql security definer set search_path = ''
as $$ delete from private.intervals_keys where athlete_id = p_athlete; $$;
revoke all on function public.save_intervals_key(uuid, text) from public, anon, authenticated;
revoke all on function public.get_intervals_key(uuid) from public, anon, authenticated;
revoke all on function public.delete_intervals_key(uuid) from public, anon, authenticated;
grant execute on function public.save_intervals_key(uuid, text) to service_role;
grant execute on function public.get_intervals_key(uuid) to service_role;
grant execute on function public.delete_intervals_key(uuid) to service_role;

-- Which Diastole workout is which intervals.icu event (and what we last sent), so edits update the
-- same event and removals delete it. No foreign key: a vanished workout still needs its event removed.
-- Server-only (row-level security with no policies).
create table public.intervals_events (
  planned_workout_id  uuid primary key,
  athlete_id          uuid not null references public.profiles (id) on delete cascade,
  event_id            bigint not null,
  fingerprint         text not null,
  scheduled_date      date not null,
  pushed_at           timestamptz not null default now()
);
create index intervals_events_athlete on public.intervals_events (athlete_id);
alter table public.intervals_events enable row level security;
revoke all on public.intervals_events from anon, authenticated;

-- Rides already brought in from intervals.icu (Zwift, Rouvy), so each is fetched once.
create table public.intervals_pulled (
  athlete_id       uuid not null references public.profiles (id) on delete cascade,
  icu_activity_id  text not null,
  activity_id      uuid,           -- the Diastole activity it became (null = skipped/unreadable)
  pulled_at        timestamptz not null default now(),
  primary key (athlete_id, icu_activity_id)
);
alter table public.intervals_pulled enable row level security;
revoke all on public.intervals_pulled from anon, authenticated;

-- A bike workout or FTP changed for a connected athlete: mark dirty and ping the server, which
-- re-syncs that athlete. The ping holds only the athlete id; the server does nothing unless the
-- row is dirty, so forged or repeated pings can't do anything new.
create or replace function private.intervals_mark_dirty(p_athlete uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.intervals_connections set dirty_at = now() where athlete_id = p_athlete;
  if not found then return; end if;
  perform net.http_post(
    url := 'https://diastole.app/api/intervals/sync',
    body := jsonb_build_object('athlete', p_athlete),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  raise warning 'intervals ping failed: %', sqlerrm; -- never block the workout change itself
end;
$$;
revoke all on function private.intervals_mark_dirty(uuid) from public, anon, authenticated;

create or replace function private.intervals_workout_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' and old.sport = 'bike' then perform private.intervals_mark_dirty(old.athlete_id); end if;
  if tg_op <> 'DELETE' and new.sport = 'bike' and (tg_op = 'INSERT' or new.athlete_id <> old.athlete_id or old.sport <> 'bike') then
    perform private.intervals_mark_dirty(new.athlete_id);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger intervals_sync after insert or delete or update of title, sport, steps, status, scheduled_date, deleted_at, athlete_id
  on public.planned_workouts
  for each row execute function private.intervals_workout_changed();

create or replace function private.intervals_ftp_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.ftp_w is distinct from (case when tg_op = 'UPDATE' then old.ftp_w end) then
    perform private.intervals_mark_dirty(new.athlete_id);
  end if;
  return new;
end;
$$;

create trigger intervals_ftp after insert or update of ftp_w on public.athlete_zones
  for each row execute function private.intervals_ftp_changed();

-- Diastole initial schema
-- One profile per signed-in person. A coach can also be their own athlete
-- (coach_id = own id), which is how the coach tests with their own data.
--
-- Who writes what:
--   * Garmin data, readiness scores  -> server only (edge functions, service role)
--   * Apple Health data              -> the athlete's own iPhone app
--   * Planned workouts               -> the coach
-- Everyone else can only read what row-level security allows.


-- ---------------------------------------------------------------- types

create type public.user_role as enum ('coach', 'athlete');
create type public.data_source as enum ('garmin', 'apple');
create type public.flag as enum ('green', 'yellow', 'red', 'unknown');
create type public.workout_status as enum ('draft', 'approved', 'sent', 'completed', 'skipped');

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'athlete',
  coach_id    uuid references public.profiles (id) on delete set null,
  full_name   text,
  email       text,
  timezone    text not null default 'America/Los_Angeles',
  created_at  timestamptz not null default now()
);

create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles (id) on delete cascade,
  email        text not null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index invites_one_open_per_email on public.invites (lower(email)) where accepted_at is null;

create table public.device_connections (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references public.profiles (id) on delete cascade,
  source            public.data_source not null,
  external_user_id  text,               -- Garmin user id; null for Apple
  connected_at      timestamptz not null default now(),
  last_synced_at    timestamptz,
  unique (athlete_id, source)
);
create unique index device_connections_external on public.device_connections (source, external_user_id)
  where external_user_id is not null;

create table public.daily_wellness (
  athlete_id          uuid not null references public.profiles (id) on delete cascade,
  date                date not null,          -- the athlete's local calendar day (morning of)
  source              public.data_source not null,
  hrv_ms              numeric,                -- Garmin: overnight avg RMSSD; Apple: SDNN. Never compared across sources.
  resting_hr          numeric,
  sleep_seconds       integer,
  sleep_score         integer,                -- Garmin only
  stress_avg          integer,                -- Garmin only (0-100)
  body_battery_high   integer,                -- Garmin only
  body_battery_low    integer,                -- Garmin only
  raw                 jsonb,
  updated_at          timestamptz not null default now(),
  primary key (athlete_id, date, source)
);

create table public.activities (
  id             uuid primary key default gen_random_uuid(),
  athlete_id     uuid not null references public.profiles (id) on delete cascade,
  source         public.data_source not null,
  external_id    text not null,
  sport          text,
  start_time     timestamptz not null,
  duration_s     integer,
  distance_m     numeric,
  avg_hr         numeric,
  max_hr         numeric,
  training_load  numeric,                    -- simple load estimate (e.g. TRIMP), filled by the readiness engine if missing
  raw            jsonb,
  created_at     timestamptz not null default now(),
  unique (source, external_id)
);
create index activities_athlete_time on public.activities (athlete_id, start_time desc);

create table public.planned_workouts (
  id                 uuid primary key default gen_random_uuid(),
  athlete_id         uuid not null references public.profiles (id) on delete cascade,
  coach_id           uuid not null references public.profiles (id) on delete cascade,
  scheduled_date     date not null,
  sport              text not null,
  title              text not null,
  description        text,
  steps              jsonb not null default '[]',   -- structured intervals
  status             public.workout_status not null default 'draft',
  approved_at        timestamptz,                   -- coach confirmation; required before sending
  sent_at            timestamptz,
  external_id        text,                          -- Garmin workout id once pushed
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint sent_requires_approval check (status not in ('sent', 'completed') or approved_at is not null)
);
create index planned_workouts_athlete_date on public.planned_workouts (athlete_id, scheduled_date);

create table public.readiness_scores (
  athlete_id    uuid not null references public.profiles (id) on delete cascade,
  date          date not null,
  overall       public.flag not null,
  recovery      public.flag not null,
  sleep         public.flag not null,
  stress        public.flag not null,
  load          public.flag not null,
  note          text not null,
  details       jsonb,                       -- today's values vs baselines, for trends and the MCP server
  computed_at   timestamptz not null default now(),
  primary key (athlete_id, date)
);

-- Garmin OAuth tokens live outside the API-exposed schema: only the server can read them.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.garmin_tokens (
  athlete_id      uuid primary key references public.profiles (id) on delete cascade,
  access_token    text not null,
  refresh_token   text not null,
  expires_at      timestamptz not null,
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers

-- True when the signed-in user is the coach of the given athlete (or is that athlete).
create or replace function public.can_see_athlete(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select target = auth.uid()
      or exists (
           select 1 from public.profiles p
           where p.id = target and p.coach_id = auth.uid()
         );
$$;

create or replace function public.is_coach_of(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target and p.coach_id = auth.uid()
  ) and exists (
    select 1 from public.profiles me
    where me.id = auth.uid() and me.role = 'coach'
  );
$$;

create or replace function public.my_coach_id()
returns uuid
language sql stable security definer set search_path = ''
as $$ select coach_id from public.profiles where id = auth.uid(); $$;

create or replace function public.is_coach()
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'coach'); $$;

-- New sign-up: create a profile; if the coach invited this email, attach them to that coach.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.invites;
begin
  select * into inv from public.invites
   where lower(email) = lower(new.email) and accepted_at is null
   order by created_at desc limit 1;

  insert into public.profiles (id, email, full_name, coach_id)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', inv.coach_id);

  if inv.id is not null then
    update public.invites set accepted_at = now() where id = inv.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger planned_workouts_touch before update on public.planned_workouts
  for each row execute function public.touch_updated_at();
create trigger daily_wellness_touch before update on public.daily_wellness
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- row-level security

alter table public.profiles           enable row level security;
alter table public.invites            enable row level security;
alter table public.device_connections enable row level security;
alter table public.daily_wellness     enable row level security;
alter table public.activities         enable row level security;
alter table public.planned_workouts   enable row level security;
alter table public.readiness_scores   enable row level security;

-- profiles: see yourself, your athletes, and your coach. Only name/timezone are self-editable.
create policy "profiles: read" on public.profiles for select to authenticated
  using (public.can_see_athlete(id) or id = public.my_coach_id());
create policy "profiles: update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, timezone) on public.profiles to authenticated;

-- invites: coaches manage their own.
create policy "invites: coach manages" on public.invites for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and public.is_coach());

-- device connections: visible to athlete + coach; athlete can register/remove their Apple connection.
create policy "connections: read" on public.device_connections for select to authenticated
  using (public.can_see_athlete(athlete_id));
create policy "connections: athlete adds apple" on public.device_connections for insert to authenticated
  with check (athlete_id = auth.uid() and source = 'apple');
create policy "connections: athlete updates apple" on public.device_connections for update to authenticated
  using (athlete_id = auth.uid() and source = 'apple') with check (athlete_id = auth.uid() and source = 'apple');
create policy "connections: athlete removes" on public.device_connections for delete to authenticated
  using (athlete_id = auth.uid());

-- wellness + activities: read by athlete + coach; the iPhone app writes the athlete's own Apple rows.
create policy "wellness: read" on public.daily_wellness for select to authenticated
  using (public.can_see_athlete(athlete_id));
create policy "wellness: apple insert" on public.daily_wellness for insert to authenticated
  with check (athlete_id = auth.uid() and source = 'apple');
create policy "wellness: apple update" on public.daily_wellness for update to authenticated
  using (athlete_id = auth.uid() and source = 'apple') with check (athlete_id = auth.uid() and source = 'apple');

create policy "activities: read" on public.activities for select to authenticated
  using (public.can_see_athlete(athlete_id));
create policy "activities: apple insert" on public.activities for insert to authenticated
  with check (athlete_id = auth.uid() and source = 'apple');
create policy "activities: apple update" on public.activities for update to authenticated
  using (athlete_id = auth.uid() and source = 'apple') with check (athlete_id = auth.uid() and source = 'apple');

-- planned workouts: coach writes for their athletes; athlete reads their own (drafts hidden).
create policy "workouts: athlete reads" on public.planned_workouts for select to authenticated
  using (athlete_id = auth.uid() and status <> 'draft');
create policy "workouts: coach manages" on public.planned_workouts for all to authenticated
  using (coach_id = auth.uid() and public.is_coach_of(athlete_id))
  with check (coach_id = auth.uid() and public.is_coach_of(athlete_id));

-- readiness: read-only for athlete + coach; written by the server.
create policy "readiness: read" on public.readiness_scores for select to authenticated
  using (public.can_see_athlete(athlete_id));

-- Plan templates (Phase 1): save a block or a full plan, apply it to athletes scaled to their zones.
--  * plan_templates: the plan (name, tags, weeks, notes per week, the zones it was written for).
--    version goes up on every edit so applied plans can be offered the update.
--  * plan_template_workouts: one row per session, by week (1..weeks) and day (0 = Monday).
--  * plan_applications: a template applied to an athlete (which version, start and race dates).
--  * planned_workouts gain the application and template session they came from.
--  * athlete_zones.css_sec_per_100m: swim threshold (CSS), so swim pace targets scale too.

alter table public.athlete_zones add column css_sec_per_100m numeric check (css_sec_per_100m is null or css_sec_per_100m between 50 and 300);

create table public.plan_templates (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles (id) on delete cascade,
  name         text not null check (length(name) between 1 and 120),
  description  text check (description is null or length(description) <= 2000),
  tags         text[] not null default '{}',
  weeks        integer not null check (weeks between 1 and 52),
  race_week    boolean not null default true, -- the last week holds the race
  week_notes   jsonb not null default '{}',   -- {"1": "Base: easy volume", ...}
  ref_zones    jsonb not null default '{}',   -- the zones its numbers were written for
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index plan_templates_coach on public.plan_templates (coach_id, updated_at desc);
alter table public.plan_templates enable row level security;
create policy "plan_templates: coach manages own" on public.plan_templates for all to authenticated
  using (coach_id = auth.uid() and public.is_coach())
  with check (coach_id = auth.uid() and public.is_coach());
grant select, insert, update, delete on public.plan_templates to authenticated;

create table public.plan_template_workouts (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.plan_templates (id) on delete cascade,
  week         integer not null check (week between 1 and 52),
  day          integer not null check (day between 0 and 6),
  position     integer not null default 0,
  title        text not null check (length(title) between 1 and 100),
  sport        text not null check (sport in ('run', 'bike', 'swim')),
  description  text,
  why          text,
  steps        jsonb not null default '[]',
  brick        jsonb,
  pool_length  numeric,
  pool_unit    text check (pool_unit is null or pool_unit in ('METER', 'YARD')),
  updated_at   timestamptz not null default now()
);
create index plan_template_workouts_template on public.plan_template_workouts (template_id, week, day, position);
alter table public.plan_template_workouts enable row level security;
create policy "plan_template_workouts: coach of template" on public.plan_template_workouts for all to authenticated
  using (exists (select 1 from public.plan_templates t where t.id = template_id and t.coach_id = auth.uid()))
  with check (exists (select 1 from public.plan_templates t where t.id = template_id and t.coach_id = auth.uid()));
grant select, insert, update, delete on public.plan_template_workouts to authenticated;

create table public.plan_applications (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid not null references public.plan_templates (id) on delete cascade,
  template_version  integer not null,
  coach_id          uuid not null references public.profiles (id) on delete cascade,
  athlete_id        uuid not null references public.profiles (id) on delete cascade,
  start_date        date not null, -- Monday of week 1
  race_date         date,
  created_at        timestamptz not null default now()
);
create index plan_applications_template on public.plan_applications (template_id);
create index plan_applications_athlete on public.plan_applications (athlete_id);
alter table public.plan_applications enable row level security;
create policy "plan_applications: coach manages own" on public.plan_applications for all to authenticated
  using (coach_id = auth.uid() and public.is_coach_of(athlete_id))
  with check (coach_id = auth.uid() and public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.plan_applications to authenticated;

alter table public.planned_workouts
  add column plan_application_id uuid references public.plan_applications (id) on delete set null,
  add column template_workout_id uuid references public.plan_template_workouts (id) on delete set null;
create index planned_workouts_application on public.planned_workouts (plan_application_id) where plan_application_id is not null;

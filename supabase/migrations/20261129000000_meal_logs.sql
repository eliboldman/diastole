-- Phase 9b: meal logging (photo or text -> Claude estimate -> athlete confirms -> totals saved)
-- and daily carb/protein/fat targets that follow training load.
--
-- Photos are never stored: the browser sends a shrunken copy with the analysis request, the
-- server passes it to Claude and keeps nothing; the athlete's phone drops it once they confirm.

-- Everyone starts with full numbers (Eli, 2026-11-06). Coaches still switch individual athletes.
alter table public.fuel_settings alter column mode set default 'full';

-- Body weight, entered by the athlete, for per-kg targets. Athlete and their coach only; never pods.
create table public.athlete_body (
  athlete_id  uuid primary key references public.profiles (id) on delete cascade,
  weight_kg   numeric(5, 1) not null check (weight_kg between 25 and 250),
  updated_at  timestamptz not null default now()
);
alter table public.athlete_body enable row level security;
create policy "athlete_body: athlete or coach reads" on public.athlete_body for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
create policy "athlete_body: athlete adds" on public.athlete_body for insert to authenticated
  with check (athlete_id = auth.uid());
create policy "athlete_body: athlete updates" on public.athlete_body for update to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
grant select, insert, update on public.athlete_body to authenticated;

-- One confirmed meal. items = what the athlete confirmed: [{name, portion, scale, carbs_g, protein_g, fat_g}].
create table public.meal_logs (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  local_date  date not null,
  eaten_at    timestamptz not null default now(),
  label       text check (char_length(label) <= 60),
  items       jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 30),
  carbs_g     numeric(6, 1) not null default 0 check (carbs_g between 0 and 2000),
  protein_g   numeric(6, 1) not null default 0 check (protein_g between 0 and 2000),
  fat_g       numeric(6, 1) not null default 0 check (fat_g between 0 and 2000),
  kcal        numeric(7, 0) generated always as (round(carbs_g * 4 + protein_g * 4 + fat_g * 9)) stored,
  source      text not null default 'photo' check (source in ('photo', 'text', 'repeat')),
  note        text check (char_length(note) <= 280),
  created_at  timestamptz not null default now()
);
create index meal_logs_athlete_date on public.meal_logs (athlete_id, local_date desc);
alter table public.meal_logs enable row level security;
create policy "meal_logs: athlete or coach reads" on public.meal_logs for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
create policy "meal_logs: athlete adds" on public.meal_logs for insert to authenticated
  with check (athlete_id = auth.uid());
create policy "meal_logs: athlete edits" on public.meal_logs for update to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy "meal_logs: athlete deletes" on public.meal_logs for delete to authenticated
  using (athlete_id = auth.uid());
grant select, insert, update, delete on public.meal_logs to authenticated;

-- Photo/text estimates count toward the coach's monthly AI cap.
alter table public.ai_usage drop constraint ai_usage_trigger_check;
alter table public.ai_usage add constraint ai_usage_trigger_check check (trigger in ('cron', 'manual', 'test', 'form', 'why', 'brief', 'build', 'meal'));

-- Who a meal estimate was for, so each athlete gets a fair daily allowance (server-side check).
alter table public.ai_usage add column athlete_id uuid references public.profiles (id) on delete set null;
create index ai_usage_athlete_day on public.ai_usage (athlete_id, created_at desc) where athlete_id is not null;

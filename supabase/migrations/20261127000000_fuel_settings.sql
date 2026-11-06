-- Phase 9a: fueling mode per athlete, chosen by the coach.
--   full    = guidance with numbers (grams, ml)
--   plates  = guidance in foods + plate pictures, no numbers (the default when there's no row)
--   workout = only before/during/after guidance for workouts; no fuel days or plates
-- The athlete reads their own mode; only their coach changes it.

create table public.fuel_settings (
  athlete_id  uuid primary key references public.profiles (id) on delete cascade,
  mode        text not null default 'plates' check (mode in ('full', 'plates', 'workout')),
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.fuel_settings enable row level security;
create policy "fuel_settings: athlete or coach reads" on public.fuel_settings for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select on public.fuel_settings to authenticated;
-- No write policies: changes go through set_fuel_mode.

-- Returns null when saved, or a message saying why not.
create or replace function public.set_fuel_mode(p_athlete uuid, p_mode text)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_coach_of(p_athlete) then return 'Only this athlete''s coach can change their fueling mode.'; end if;
  if p_mode is null or p_mode not in ('full', 'plates', 'workout') then return 'Unknown fueling mode.'; end if;
  insert into public.fuel_settings (athlete_id, mode, updated_by, updated_at)
  values (p_athlete, p_mode, auth.uid(), now())
  on conflict (athlete_id) do update set mode = excluded.mode, updated_by = excluded.updated_by, updated_at = now();
  return null;
end;
$$;
revoke all on function public.set_fuel_mode(uuid, text) from public, anon;
grant execute on function public.set_fuel_mode(uuid, text) to authenticated;

-- Dietitians (Eli, 2026-11-12): "full access to everything" a coach has for their athletes.
--
-- A dietitian is linked to the inviting coach through team_coach_id, not coach_id, so they never
-- show up in the coach's roster (rosters are profiles where coach_id = coach).

alter table public.profiles add column team_coach_id uuid references public.profiles (id) on delete cascade;
alter table public.profiles add constraint team_coach_only_dietitians check (team_coach_id is null or role = 'dietitian');
create index profiles_team_coach on public.profiles (team_coach_id) where team_coach_id is not null;

-- True when the signed-in user is a dietitian on the team that `target` belongs to.
create or replace function public.is_dietitian_of(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles me
      join public.profiles p on p.coach_id = me.team_coach_id
     where me.id = auth.uid() and me.role = 'dietitian' and me.team_coach_id is not null and p.id = target
  );
$$;

-- Every athlete-data policy goes through these two, so extending them gives a dietitian the same
-- reach as the coach: read everything, and change what the coach can change for an athlete.
create or replace function public.can_see_athlete(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select target = auth.uid()
      or exists (select 1 from public.profiles p where p.id = target and p.coach_id = auth.uid())
      or public.is_dietitian_of(target);
$$;

create or replace function public.is_coach_of(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (
    exists (select 1 from public.profiles p where p.id = target and p.coach_id = auth.uid())
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'coach')
  ) or public.is_dietitian_of(target);
$$;

-- The coach sees the dietitians they invited (to list and remove them).
create policy "profiles: coach sees their dietitians" on public.profiles for select to authenticated
  using (team_coach_id = auth.uid());

-- Sign-up: a dietitian invite makes a dietitian on the inviting coach's team.
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

  if inv.id is not null and inv.role = 'coach' then
    insert into public.profiles (id, email, full_name, role, coach_id)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'coach', new.id);
  elsif inv.id is not null and inv.role = 'dietitian' then
    insert into public.profiles (id, email, full_name, role, coach_id, team_coach_id)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'dietitian', null, inv.coach_id);
  else
    insert into public.profiles (id, email, full_name, coach_id)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', inv.coach_id);
  end if;

  if inv.id is not null then
    update public.invites set accepted_at = now() where id = inv.id;
  end if;
  return new;
end;
$$;

-- Per-athlete nutrition goals. per_kg overrides the default grams-per-kg ranges by training day:
--   {"low": {"carbs": [3, 5], "protein": [1.6, 2.0], "fat": [0.8, 1.2]}, "medium": {...}, "high": {...}}
-- Anything missing falls back to the defaults. note: a message to the athlete, shown on their Fuel page.
create table public.nutrition_goals (
  athlete_id  uuid primary key references public.profiles (id) on delete cascade,
  per_kg      jsonb not null default '{}'::jsonb check (jsonb_typeof(per_kg) = 'object'),
  note        text check (char_length(note) <= 800),
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.nutrition_goals enable row level security;
create policy "nutrition_goals: athlete and staff read" on public.nutrition_goals for select to authenticated
  using (public.can_see_athlete(athlete_id));
create policy "nutrition_goals: staff add" on public.nutrition_goals for insert to authenticated
  with check (public.is_coach_of(athlete_id));
create policy "nutrition_goals: staff edit" on public.nutrition_goals for update to authenticated
  using (public.is_coach_of(athlete_id)) with check (public.is_coach_of(athlete_id));
create policy "nutrition_goals: staff clear" on public.nutrition_goals for delete to authenticated
  using (public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.nutrition_goals to authenticated;

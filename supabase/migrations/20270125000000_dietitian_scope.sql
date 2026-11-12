-- The coach chooses which athletes each dietitian sees (Eli, 2026-11-12): all of the team, or only
-- the athletes picked. The same choice can be made on a pending invite and carries over at sign-up.

alter table public.profiles add column dietitian_all boolean not null default true;

create table public.dietitian_athletes (
  dietitian_id uuid not null references public.profiles (id) on delete cascade,
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (dietitian_id, athlete_id)
);
create index dietitian_athletes_athlete on public.dietitian_athletes (athlete_id);
alter table public.dietitian_athletes enable row level security;
-- The coach (who owns the dietitian) and the dietitian read; changes go through set_dietitian_access.
create policy "dietitian_athletes: coach or dietitian reads" on public.dietitian_athletes for select to authenticated
  using (
    dietitian_id = auth.uid()
    or exists (select 1 from public.profiles d where d.id = dietitian_id and d.team_coach_id = auth.uid())
  );
grant select on public.dietitian_athletes to authenticated;

alter table public.invites add column dietitian_all boolean not null default true;
alter table public.invites add column dietitian_athletes uuid[] not null default '{}';

-- A dietitian reaches an athlete on their team only when they see everyone or that athlete was picked.
create or replace function public.is_dietitian_of(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles me
      join public.profiles p on p.coach_id = me.team_coach_id
     where me.id = auth.uid() and me.role = 'dietitian' and me.team_coach_id is not null and p.id = target
       and (me.dietitian_all or exists (select 1 from public.dietitian_athletes da where da.dietitian_id = me.id and da.athlete_id = target))
  );
$$;

-- Coach only. p_all = everyone on the team; otherwise exactly p_athletes (their own athletes only).
-- Returns null when saved, or a message saying why not.
create or replace function public.set_dietitian_access(p_dietitian uuid, p_all boolean, p_athletes uuid[])
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  coach uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles where id = p_dietitian and role = 'dietitian' and team_coach_id = coach) then
    return 'Dietitian not found.';
  end if;
  update public.profiles set dietitian_all = coalesce(p_all, false) where id = p_dietitian;
  delete from public.dietitian_athletes where dietitian_id = p_dietitian;
  if not coalesce(p_all, false) then
    insert into public.dietitian_athletes (dietitian_id, athlete_id)
    select p_dietitian, p.id from public.profiles p where p.id = any (coalesce(p_athletes, '{}')) and p.coach_id = coach
    on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke all on function public.set_dietitian_access(uuid, boolean, uuid[]) from public, anon;
grant execute on function public.set_dietitian_access(uuid, boolean, uuid[]) to authenticated;

-- The same for an invite that hasn't been accepted yet.
create or replace function public.set_dietitian_invite_access(p_invite uuid, p_all boolean, p_athletes uuid[])
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  coach uuid := auth.uid();
begin
  update public.invites
     set dietitian_all = coalesce(p_all, false),
         dietitian_athletes = case when coalesce(p_all, false) then '{}'::uuid[]
           else coalesce((select array_agg(p.id) from public.profiles p where p.id = any (coalesce(p_athletes, '{}')) and p.coach_id = coach), '{}') end
   where id = p_invite and coach_id = coach and role = 'dietitian' and accepted_at is null;
  if not found then return 'Invite not found.'; end if;
  return null;
end;
$$;
revoke all on function public.set_dietitian_invite_access(uuid, boolean, uuid[]) from public, anon;
grant execute on function public.set_dietitian_invite_access(uuid, boolean, uuid[]) to authenticated;

-- Sign-up: a dietitian invite carries its athlete choice over.
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
    insert into public.profiles (id, email, full_name, role, coach_id, team_coach_id, dietitian_all)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'dietitian', null, inv.coach_id, inv.dietitian_all);
    if not inv.dietitian_all then
      insert into public.dietitian_athletes (dietitian_id, athlete_id)
      select new.id, p.id from public.profiles p where p.id = any (inv.dietitian_athletes) and p.coach_id = inv.coach_id
      on conflict do nothing;
    end if;
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

-- Invite another coach, not just athletes. An invited coach gets their own roster: they're
-- their own athlete (coach_id = own id, like the first coach) and see only athletes they invite.
alter table public.invites add column role public.user_role not null default 'athlete';

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

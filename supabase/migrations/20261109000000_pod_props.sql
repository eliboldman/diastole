-- Pod props & heckles: pod members (and the pod's coach) send stickers to each other, in bulk.
-- No free text: the sticker is a key from the app's catalog, so nothing typed can turn mean.
-- The table has no client policies; everything goes through the functions below.

create table public.pod_props (
  id          uuid primary key default gen_random_uuid(),
  pod_id      uuid not null references public.pods (id) on delete cascade,
  from_id     uuid not null references public.profiles (id) on delete cascade,
  to_id       uuid not null references public.profiles (id) on delete cascade,
  sticker     text not null check (sticker ~ '^[a-z0-9_]{1,40}$'),
  count       integer not null check (count between 1 and 1000000),
  hidden      boolean not null default false, -- the recipient waved it away
  created_at  timestamptz not null default now(),
  check (from_id <> to_id)
);
create index pod_props_pod_time on public.pod_props (pod_id, created_at desc);
create index pod_props_sender_time on public.pod_props (from_id, created_at desc);

alter table public.pod_props enable row level security;

-- Send. The sender must be an active member or the pod's coach; the recipient an active member.
-- Light rate limit so a stuck finger can't flood the table.
create or replace function public.send_pod_props(p_pod uuid, p_to uuid, p_sticker text, p_count integer)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return 'Sign in first.'; end if;
  if p_to = me then return 'self'; end if;
  if not (coalesce(public.my_pod_status(p_pod) = 'active', false) or public.is_pod_coach(p_pod)) then
    return 'You''re not in this pod.';
  end if;
  if not exists (select 1 from public.pod_members where pod_id = p_pod and athlete_id = p_to and status = 'active') then
    return 'They''re not in this pod.';
  end if;
  if p_sticker !~ '^[a-z0-9_]{1,40}$' or p_count is null or p_count < 1 or p_count > 1000000 then
    return 'That sticker doesn''t exist.';
  end if;
  if (select count(*) from public.pod_props where from_id = me and created_at > now() - interval '10 minutes') >= 60 then
    return 'slow';
  end if;

  insert into public.pod_props (pod_id, from_id, to_id, sticker, count) values (p_pod, me, p_to, p_sticker, p_count);
  return null; -- null = sent
end;
$$;

-- The recipient hides every one of a sticker sent to them in this pod (for everyone but the coach).
create or replace function public.hide_pod_props(p_pod uuid, p_sticker text)
returns void
language sql security definer set search_path = ''
as $$
  update public.pod_props set hidden = true where pod_id = p_pod and to_id = auth.uid() and sticker = p_sticker;
$$;

-- What a pod sees: totals per recipient and sticker, plus the latest sends with sender names.
-- Same visibility as the pod feed. Hidden ones are left out except for the coach.
create or replace function public.get_pod_props(p_pod uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  coach boolean := public.is_pod_coach(p_pod);
begin
  if not (coalesce(public.my_pod_status(p_pod) = 'active', false) or coach) then return null; end if;

  return jsonb_build_object(
    'totals', coalesce((
      select jsonb_agg(t) from (
        select to_id, sticker, sum(count)::bigint as total, count(distinct from_id) as senders,
               bool_or(from_id = auth.uid()) as from_me, bool_and(hidden) as hidden
        from public.pod_props
        where pod_id = p_pod and (coach or not hidden)
        group by to_id, sticker) t), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(r order by r.created_at desc) from (
        select pp.id, pp.to_id, pp.sticker, pp.count, pp.created_at, pp.from_id = auth.uid() as from_me,
               coalesce(nullif(split_part(p.full_name, ' ', 1), ''), case when p.role = 'coach' then 'Coach' else 'Someone' end) as from_name
        from public.pod_props pp join public.profiles p on p.id = pp.from_id
        where pp.pod_id = p_pod and (coach or not pp.hidden)
        order by pp.created_at desc limit 20) r), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.send_pod_props(uuid, uuid, text, integer) from public, anon;
revoke all on function public.hide_pod_props(uuid, text) from public, anon;
revoke all on function public.get_pod_props(uuid) from public, anon;
grant execute on function public.send_pod_props(uuid, uuid, text, integer) to authenticated;
grant execute on function public.hide_pod_props(uuid, text) to authenticated;
grant execute on function public.get_pod_props(uuid) to authenticated;

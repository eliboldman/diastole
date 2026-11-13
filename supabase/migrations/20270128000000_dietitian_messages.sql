-- Dietitian <-> athlete messages. A 'dietitian' conversation is a one-to-one thread between a team
-- dietitian (stored in coach_id, the "staff" side) and one athlete. Either side may start it. It
-- belongs to those two people only while the dietitian can see that athlete (the coach's per-
-- dietitian choice): narrowing access hides the thread from both sides until access returns.
-- The coach does not read these threads (as with the coach's own threads, nobody else sees them).

alter table public.conversations drop constraint conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check check (kind in ('direct', 'pod', 'dietitian'));
alter table public.conversations drop constraint conversations_check;
alter table public.conversations add constraint conversations_check check (
  (kind in ('direct', 'dietitian') and athlete_id is not null and pod_id is null and athlete_id <> coach_id)
  or (kind = 'pod' and pod_id is not null and athlete_id is null));
create unique index conversations_dietitian on public.conversations (coach_id, athlete_id) where kind = 'dietitian';

-- Can this dietitian see this athlete right now? (Same rule as is_dietitian_of, for any two people.)
create or replace function private.dietitian_sees(p_dietitian uuid, p_athlete uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles d join public.profiles a on a.id = p_athlete
    where d.id = p_dietitian and d.role = 'dietitian' and a.coach_id is not null and d.team_coach_id = a.coach_id
      and (d.dietitian_all or exists (select 1 from public.dietitian_athletes x where x.dietitian_id = d.id and x.athlete_id = a.id)));
$$;

create or replace function public.is_conversation_member(p_conv uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conv and (
      (c.kind = 'direct'
        and auth.uid() in (c.coach_id, c.athlete_id)
        and exists (select 1 from public.profiles a where a.id = c.athlete_id and a.coach_id = c.coach_id))
      or (c.kind = 'dietitian'
        and auth.uid() in (c.coach_id, c.athlete_id)
        and private.dietitian_sees(c.coach_id, c.athlete_id))
      or (c.kind = 'pod'
        and (public.is_pod_coach(c.pod_id) or coalesce(public.my_pod_status(c.pod_id) = 'active', false)))
    )
  );
$$;

create or replace function private.conversation_others(p_conv uuid, p_except uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select u from (
    select c.coach_id as u from public.conversations c where c.id = p_conv
    union
    select c.athlete_id from public.conversations c where c.id = p_conv and c.kind in ('direct', 'dietitian')
    union
    select pm.athlete_id from public.conversations c
      join public.pod_members pm on pm.pod_id = c.pod_id and pm.status = 'active'
      where c.id = p_conv and c.kind = 'pod'
  ) x where u is not null and u <> p_except;
$$;

-- Open (or create) a one-to-one thread with someone: coach <-> athlete, or dietitian <-> athlete.
-- Dietitians are checked first (is_coach_of also covers dietitians, for reading athlete data).
create or replace function public.open_direct_conversation(p_other uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_kind text := 'direct';
  v_staff uuid;
  v_athlete uuid;
  v_id uuid;
begin
  if me is null or p_other is null or p_other = me then return null; end if;
  if private.dietitian_sees(me, p_other) then
    v_kind := 'dietitian'; v_staff := me; v_athlete := p_other;
  elsif private.dietitian_sees(p_other, me) then
    v_kind := 'dietitian'; v_staff := p_other; v_athlete := me;
  elsif exists (select 1 from public.profiles where id = me and role = 'dietitian') then
    return null;
  elsif public.is_coach_of(p_other) then
    v_staff := me; v_athlete := p_other;
  elsif public.my_coach_id() = p_other then
    v_staff := p_other; v_athlete := me;
  else
    return null;
  end if;
  if v_kind = 'dietitian' then
    insert into public.conversations (kind, coach_id, athlete_id) values ('dietitian', v_staff, v_athlete)
      on conflict (coach_id, athlete_id) where kind = 'dietitian' do nothing;
  else
    insert into public.conversations (kind, coach_id, athlete_id) values ('direct', v_staff, v_athlete)
      on conflict (coach_id, athlete_id) where kind = 'direct' do nothing;
  end if;
  select id into v_id from public.conversations where kind = v_kind and coach_id = v_staff and athlete_id = v_athlete;
  return v_id;
end;
$$;

create or replace function public.get_conversation(p_conv uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.conversations;
begin
  if not public.is_conversation_member(p_conv) then return null; end if;
  select * into c from public.conversations where id = p_conv;
  return jsonb_build_object(
    'id', c.id,
    'kind', c.kind,
    'pod_id', c.pod_id,
    'title', case when c.kind = 'pod' then (select name from public.pods where id = c.pod_id)
                  else private.display_name(case when auth.uid() = c.coach_id then c.athlete_id else c.coach_id end) end,
    'other_id', case when c.kind <> 'pod' then case when auth.uid() = c.coach_id then c.athlete_id else c.coach_id end end,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
                                          'role', p.role, 'is_me', p.id = auth.uid()))
      from public.profiles p
      where p.id = c.coach_id or p.id in (select * from private.conversation_others(p_conv, c.coach_id))), '[]'::jsonb),
    'reads', coalesce((
      select jsonb_object_agg(r.user_id, r.last_read_at) from public.conversation_reads r where r.conversation_id = p_conv), '{}'::jsonb)
  );
end;
$$;

create or replace function public.get_inbox()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(row_to_json(x) order by x.last_message_at desc nulls last), '[]'::jsonb)
  from (
    select c.id, c.kind, c.pod_id, c.last_message_at,
           case when c.kind = 'pod' then (select name from public.pods where id = c.pod_id)
                else private.display_name(case when auth.uid() = c.coach_id then c.athlete_id else c.coach_id end) end as title,
           case when c.kind <> 'pod' then case when auth.uid() = c.coach_id then c.athlete_id else c.coach_id end end as other_id,
           (select jsonb_build_object('body', case when m.deleted_at is not null then null else m.body end, 'media_kind', m.media_kind,
                                      'deleted', m.deleted_at is not null, 'from_me', m.sender_id = auth.uid(),
                                      'sender', split_part(private.display_name(m.sender_id), ' ', 1))
              from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last,
           (select count(*) from public.messages m
              where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.deleted_at is null
                and m.created_at > coalesce((select last_read_at from public.conversation_reads r
                                             where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity')) as unread
    from public.conversations c
    where public.is_conversation_member(c.id)
  ) x;
$$;

-- An athlete's dietitians (names for "Message Lori"): those who can see them now.
create or replace function public.my_dietitians()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = ''
as $$
  select d.id, coalesce(nullif(btrim(d.full_name), ''), 'Team dietitian')
  from public.profiles d
  where d.role = 'dietitian' and private.dietitian_sees(d.id, auth.uid())
  order by d.full_name;
$$;
revoke all on function public.my_dietitians() from public, anon;
grant execute on function public.my_dietitians() to authenticated;

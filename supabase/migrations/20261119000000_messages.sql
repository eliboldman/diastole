-- Phase 4: realtime messaging.
--
-- * conversations: 'direct' (one per coach + athlete) or 'pod' (one thread per pod).
--   Membership is computed, never stored: a direct thread belongs to the coach and the athlete while
--   the athlete is still coached by them; a pod thread to the pod's coach and its active members.
-- * messages: text, a photo or a voice note (files in the private 'message-media' bucket under
--   <conversation_id>/...), optionally pointing at a workout. Clients insert directly (RLS) with a
--   client-made id, so optimistic sends dedupe against the realtime echo. Deleting is soft.
-- * conversation_reads: each member's last-read time, for unread counts and "Seen".
-- * Notifications fold to one row per recipient per conversation and clear when the thread is read.
-- Typing indicators use Realtime broadcast on the client and never touch the database.

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('direct', 'pod')),
  coach_id         uuid not null references public.profiles (id) on delete cascade,
  athlete_id       uuid references public.profiles (id) on delete cascade,
  pod_id           uuid references public.pods (id) on delete cascade,
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  check ((kind = 'direct' and athlete_id is not null and pod_id is null and athlete_id <> coach_id)
      or (kind = 'pod' and pod_id is not null and athlete_id is null))
);
create unique index conversations_direct on public.conversations (coach_id, athlete_id) where kind = 'direct';
create unique index conversations_pod on public.conversations (pod_id) where kind = 'pod';
alter table public.conversations enable row level security;

create table public.messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.conversations (id) on delete cascade,
  sender_id           uuid not null references public.profiles (id) on delete cascade,
  body                text check (body is null or length(body) between 1 and 2000),
  media_kind          text check (media_kind in ('photo', 'voice')),
  media_path          text,
  media_meta          jsonb not null default '{}', -- photo: w, h; voice: seconds, mime
  activity_id         uuid references public.activities (id) on delete set null,
  planned_workout_id  uuid references public.planned_workouts (id) on delete set null,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  check (body is not null or media_path is not null),
  check ((media_kind is null) = (media_path is null))
);
create index messages_conversation_time on public.messages (conversation_id, created_at desc);
create index messages_activity on public.messages (activity_id) where activity_id is not null;
create index messages_sender_time on public.messages (sender_id, created_at desc);
alter table public.messages enable row level security;

create table public.conversation_reads (
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  last_read_at     timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.conversation_reads enable row level security;

-- ---------------------------------------------------------------- membership
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
      or (c.kind = 'pod'
        and (public.is_pod_coach(c.pod_id) or coalesce(public.my_pod_status(c.pod_id) = 'active', false)))
    )
  );
$$;

-- Storage paths are <conversation_id>/<file>; anything else is refused.
create or replace function public.is_conversation_member_path(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,80}$'
      then public.is_conversation_member(split_part(p_name, '/', 1)::uuid)
    else false
  end;
$$;

-- Everyone in a conversation other than the given user (for notifications).
create or replace function private.conversation_others(p_conv uuid, p_except uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select u from (
    select c.coach_id as u from public.conversations c where c.id = p_conv
    union
    select c.athlete_id from public.conversations c where c.id = p_conv and c.kind = 'direct'
    union
    select pm.athlete_id from public.conversations c
      join public.pod_members pm on pm.pod_id = c.pod_id and pm.status = 'active'
      where c.id = p_conv and c.kind = 'pod'
  ) x where u is not null and u <> p_except;
$$;

-- ---------------------------------------------------------------- policies
create policy "conversations: members read" on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

create policy "messages: members read" on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy "messages: members send" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and deleted_at is null
    and public.is_conversation_member(conversation_id)
    and (media_path is null or (split_part(media_path, '/', 1) = conversation_id::text and public.is_conversation_member_path(media_path)))
    -- A linked workout must be one the sender can see (RLS applies inside these checks).
    and (activity_id is null or exists (select 1 from public.activities a where a.id = activity_id))
    and (planned_workout_id is null or exists (select 1 from public.planned_workouts w where w.id = planned_workout_id))
  );

create policy "conversation_reads: members read" on public.conversation_reads for select to authenticated
  using (public.is_conversation_member(conversation_id));

grant select on public.conversations, public.conversation_reads to authenticated;
grant select, insert on public.messages to authenticated;

-- Server time and a rate limit, whatever the client sent.
create or replace function private.before_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.created_at := now();
  new.deleted_at := null;
  if (select count(*) from public.messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 40 then
    raise exception 'Slow down a little.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger before_message before insert on public.messages
  for each row execute function private.before_message();

-- After a send: bump the conversation, count it as read by the sender, notify everyone else.
create or replace function private.after_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  c public.conversations;
  preview text := coalesce(new.body, case new.media_kind when 'photo' then '📷 Photo' when 'voice' then '🎤 Voice note' end);
  title text;
  r uuid;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id returning * into c;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at) values (new.conversation_id, new.sender_id, new.created_at)
    on conflict (conversation_id, user_id) do update set last_read_at = greatest(public.conversation_reads.last_read_at, excluded.last_read_at);

  if private.is_test_profile(new.sender_id) then return new; end if;
  title := private.display_name(new.sender_id);
  if c.kind = 'pod' then
    title := title || ' in ' || coalesce((select name from public.pods where id = c.pod_id), 'your pod');
  end if;
  for r in select * from private.conversation_others(new.conversation_id, new.sender_id) loop
    perform private.notify(r, 'message', title, left(preview, 140), '/messages/' || new.conversation_id,
      'msg:' || new.conversation_id, jsonb_build_object('conversation_id', new.conversation_id), new.sender_id);
  end loop;
  return new;
end;
$$;
create trigger after_message after insert on public.messages
  for each row execute function private.after_message();

-- ---------------------------------------------------------------- functions the app calls
-- Open (or create) the coach <-> athlete thread. Either side may call it with the other's id.
create or replace function public.open_direct_conversation(p_other uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_coach uuid;
  v_athlete uuid;
  v_id uuid;
begin
  if me is null or p_other is null or p_other = me then return null; end if;
  if public.is_coach_of(p_other) then
    v_coach := me; v_athlete := p_other;
  elsif public.my_coach_id() = p_other then
    v_coach := p_other; v_athlete := me;
  else
    return null;
  end if;
  insert into public.conversations (kind, coach_id, athlete_id) values ('direct', v_coach, v_athlete)
    on conflict (coach_id, athlete_id) where kind = 'direct' do nothing;
  select id into v_id from public.conversations where kind = 'direct' and coach_id = v_coach and athlete_id = v_athlete;
  return v_id;
end;
$$;

-- Open (or create) a pod's group thread. The pod's coach or an active member may.
create or replace function public.open_pod_conversation(p_pod uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_coach uuid;
begin
  if not (public.is_pod_coach(p_pod) or coalesce(public.my_pod_status(p_pod) = 'active', false)) then return null; end if;
  select coach_id into v_coach from public.pods where id = p_pod;
  insert into public.conversations (kind, coach_id, pod_id) values ('pod', v_coach, p_pod)
    on conflict (pod_id) where kind = 'pod' do nothing;
  select id into v_id from public.conversations where kind = 'pod' and pod_id = p_pod;
  return v_id;
end;
$$;

-- Everything a thread view needs besides the messages: title, the people in it, read times.
-- Names come from here because pod mates can't read each other's profiles directly.
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
    'other_id', case when c.kind = 'direct' then case when auth.uid() = c.coach_id then c.athlete_id else c.coach_id end end,
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

-- The inbox: my conversations, newest first, with a preview and my unread count.
create or replace function public.get_inbox()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(row_to_json(x) order by x.last_message_at desc nulls last), '[]'::jsonb)
  from (
    select c.id, c.kind, c.pod_id, c.last_message_at,
           case when c.kind = 'pod' then (select name from public.pods where id = c.pod_id)
                else private.display_name(case when auth.uid() = c.coach_id then c.athlete_id else c.coach_id end) end as title,
           case when c.kind = 'direct' then case when auth.uid() = c.coach_id then c.athlete_id else c.coach_id end end as other_id,
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

-- Mark a thread read up to now; also clears its notification.
create or replace function public.mark_conversation_read(p_conv uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_conversation_member(p_conv) then return; end if;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at) values (p_conv, auth.uid(), now())
    on conflict (conversation_id, user_id) do update set last_read_at = now();
  update public.notifications set read_at = now()
    where user_id = auth.uid() and dedupe_key = 'msg:' || p_conv and read_at is null;
end;
$$;

-- The sender takes back a message. Its file path is returned so the app can delete the file too.
create or replace function public.delete_message(p_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  path text;
begin
  update public.messages set deleted_at = now()
    where id = p_id and sender_id = auth.uid() and deleted_at is null
    returning media_path into path;
  return path;
end;
$$;

-- Total unread across threads (for the Messages tab dot).
create or replace function public.unread_message_count()
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.messages m
  where m.sender_id <> auth.uid() and m.deleted_at is null and public.is_conversation_member(m.conversation_id)
    and m.created_at > coalesce((select last_read_at from public.conversation_reads r
                                 where r.conversation_id = m.conversation_id and r.user_id = auth.uid()), '-infinity')
    and m.created_at > now() - interval '90 days';
$$;

revoke all on function public.open_direct_conversation(uuid) from public, anon;
revoke all on function public.open_pod_conversation(uuid) from public, anon;
revoke all on function public.get_conversation(uuid) from public, anon;
revoke all on function public.get_inbox() from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.delete_message(uuid) from public, anon;
revoke all on function public.unread_message_count() from public, anon;
revoke all on function public.is_conversation_member(uuid) from public, anon;
revoke all on function public.is_conversation_member_path(text) from public, anon;
grant execute on function public.open_direct_conversation(uuid) to authenticated;
grant execute on function public.open_pod_conversation(uuid) to authenticated;
grant execute on function public.get_conversation(uuid) to authenticated;
grant execute on function public.get_inbox() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.unread_message_count() to authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.is_conversation_member_path(text) to authenticated;

-- ---------------------------------------------------------------- realtime
alter publication supabase_realtime add table public.messages, public.conversation_reads;

-- ---------------------------------------------------------------- media storage (private)
-- 10 MB cap; photos are shrunk in the browser first, voice notes are capped at 60 s.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-media', 'message-media', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac'])
on conflict (id) do nothing;

create policy "message media: members read" on storage.objects for select to authenticated
  using (bucket_id = 'message-media' and public.is_conversation_member_path(name));
create policy "message media: members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'message-media' and public.is_conversation_member_path(name));
create policy "message media: uploader deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'message-media' and owner_id = auth.uid()::text);

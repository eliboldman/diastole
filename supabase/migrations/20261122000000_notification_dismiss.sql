-- Dismissable notifications.
-- * dismissed_at: cleared from the bell and the inbox (by hand, by opening it, by reading the chat
--   it's about, or automatically a week after it was read). New activity on the same row (same
--   dedupe key, e.g. more props from the same person) brings it back.
-- * The client may set read_at and dismissed_at on its own rows, nothing else.

alter table public.notifications add column dismissed_at timestamptz;
create index notifications_live on public.notifications (user_id, created_at desc) where dismissed_at is null;
grant update (read_at, dismissed_at) on public.notifications to authenticated;

create or replace function private.notify(
  p_user uuid, p_kind text, p_title text, p_body text, p_href text,
  p_key text default null, p_meta jsonb default '{}', p_actor uuid default auth.uid()
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  if exists (select 1 from public.profiles where id = p_user and is_test) then return; end if;

  insert into public.notifications (user_id, actor_id, kind, title, body, href, meta, dedupe_key)
  values (p_user, p_actor, p_kind, left(p_title, 200), left(p_body, 500), p_href, coalesce(p_meta, '{}'),
          coalesce(p_key, gen_random_uuid()::text))
  on conflict (user_id, dedupe_key) do update
    set title = excluded.title, body = excluded.body, href = excluded.href, meta = excluded.meta,
        actor_id = excluded.actor_id, read_at = null, dismissed_at = null, created_at = now();
exception when others then
  raise warning 'notify failed: %', sqlerrm;
end;
$$;

-- Reading a chat also clears its notification.
create or replace function public.mark_conversation_read(p_conv uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_conversation_member(p_conv) then return; end if;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at) values (p_conv, auth.uid(), now())
    on conflict (conversation_id, user_id) do update set last_read_at = now();
  update public.notifications set read_at = coalesce(read_at, now()), dismissed_at = now()
    where user_id = auth.uid() and dedupe_key = 'msg:' || p_conv and dismissed_at is null;
end;
$$;

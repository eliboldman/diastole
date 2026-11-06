-- Push notifications to the iPhone app. When a bell notification is created, or refreshed by a
-- folded repeat (a second message in the same conversation updates the same row), the database
-- pings the server, which sends it through Apple to that user's phones.
--
-- The ping carries only the notification id. The server re-reads the row and sends only when it
-- hasn't pushed that version yet (pushed_at < created_at), so a replayed or forged ping can't send
-- anything extra or anything that isn't already in that person's bell.

create extension if not exists pg_net with schema extensions;

alter table public.notifications add column pushed_at timestamptz;

create or replace function private.push_notification()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.push_tokens where user_id = new.user_id) then return new; end if;
  perform net.http_post(
    url := 'https://diastole.app/api/push/deliver',
    body := jsonb_build_object('id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  raise warning 'push ping failed: %', sqlerrm; -- never block the notification itself
  return new;
end;
$$;

create trigger push_on_insert after insert on public.notifications
  for each row execute function private.push_notification();
create trigger push_on_refresh after update of created_at on public.notifications
  -- Only private.notify sets created_at (a folded repeat); read/dismiss updates never touch it.
  for each row when (new.dismissed_at is null)
  execute function private.push_notification();

-- Sound per notification group, chosen in Me -> Notifications. Missing = the Diastole default.
alter table public.profiles add column push_sounds jsonb not null default '{}';

create or replace function public.set_push_sound(p_group text, p_sound text)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return 'Sign in first.'; end if;
  if p_group not in ('props', 'comments', 'messages', 'pods', 'workouts', 'coaching') then return 'Unknown group.'; end if;
  if p_sound not in ('heartbeat', 'chime', 'pop', 'tone', 'tick', 'default', 'none') then return 'Unknown sound.'; end if;
  update public.profiles set push_sounds = push_sounds || jsonb_build_object(p_group, p_sound) where id = auth.uid();
  return null;
end;
$$;
revoke all on function public.set_push_sound(text, text) from public, anon;
grant execute on function public.set_push_sound(text, text) to authenticated;

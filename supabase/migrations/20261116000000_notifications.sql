-- Phase 3: notifications (bell + center) and push device tokens for the iOS app.
--
-- Notifications are written only by triggers on the tables where things happen, so every code path
-- (web, cron, Garmin sync, later the iOS app and MCP) produces them the same way. Users can read
-- and mark their own; nobody can insert from the client.
--
-- dedupe_key folds repeats into one row (e.g. many props from the same person in an hour, or
-- several edits to one workout): the row is refreshed and becomes unread again.

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  kind        text not null check (kind in (
                'workout_sent', 'workout_updated', 'workout_removed',
                'pod_invite', 'pod_props',
                'ai_suggestion', 'form_insight',
                'athlete_joined', 'pod_answer', 'garmin_disconnected',
                'message')),
  title       text not null check (length(title) between 1 and 200),
  body        text check (body is null or length(body) <= 500),
  href        text check (href is null or href ~ '^/'),
  meta        jsonb not null default '{}',
  dedupe_key  text not null default gen_random_uuid()::text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_time on public.notifications (user_id, created_at desc);
create index notifications_user_unread on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "Read own notifications" on public.notifications for select
  using (user_id = auth.uid());
create policy "Mark own notifications" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Clear own notifications" on public.notifications for delete
  using (user_id = auth.uid());

-- Only read_at may change from the client.
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- Live badge in the web app.
alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------- writer

create schema if not exists private;

-- Insert or refresh one notification. Skipped for the person who caused it and for AI test-mode
-- athletes (who aren't real people). Returns nothing; never raises, so a notification problem
-- can never block the action that caused it.
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
        actor_id = excluded.actor_id, read_at = null, created_at = now();
exception when others then
  raise warning 'notify failed: %', sqlerrm;
end;
$$;

create or replace function private.display_name(p_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$ select coalesce((select coalesce(nullif(btrim(full_name), ''), split_part(email, '@', 1)) from public.profiles where id = p_id), 'Someone'); $$;

create or replace function private.is_test_profile(p_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select is_test from public.profiles where id = p_id), false); $$;

-- ---------------------------------------------------------------- athletes: workouts

create or replace function private.on_planned_workout()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  day text;
  href text := '/training/workouts/' || new.id;
  key text;
  prior jsonb;
  ids jsonb;
  n integer;
begin
  if new.athlete_id = new.coach_id then return new; end if; -- coach planning for themself

  day := to_char(new.scheduled_date, 'Dy Mon FMDD');

  -- Removed (soft delete) after the athlete could see it.
  if tg_op = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null then
    if old.status <> 'draft' then
      perform private.notify(new.athlete_id, 'workout_removed', 'Workout removed: ' || new.title,
        'Your coach removed ' || day || '''s workout.', '/training', 'workout:' || new.id || ':removed', '{}', new.coach_id);
    end if;
    return new;
  end if;
  if new.deleted_at is not null then return new; end if;

  -- Newly sent. Sends from the same coach within an hour fold into one notification.
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    key := 'sent:' || new.coach_id || ':' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24');
    select meta into prior from public.notifications where user_id = new.athlete_id and dedupe_key = key;
    ids := coalesce(prior -> 'ids', '[]'::jsonb);
    if not ids ? new.id::text then ids := ids || to_jsonb(new.id::text); end if;
    n := jsonb_array_length(ids);
    if n = 1 then
      perform private.notify(new.athlete_id, 'workout_sent', 'New workout: ' || new.title,
        day || ' · ' || initcap(replace(new.sport, '_', ' ')), href, key, jsonb_build_object('ids', ids), new.coach_id);
    else
      perform private.notify(new.athlete_id, 'workout_sent', n || ' new workouts from your coach',
        'Latest: ' || new.title || ' on ' || day || '.', '/training', key, jsonb_build_object('ids', ids), new.coach_id);
    end if;
    return new;
  end if;

  -- Changed while already on the athlete's plan.
  if tg_op = 'UPDATE' and new.status = 'sent' and old.status = 'sent'
     and (new.title, new.scheduled_date, new.steps, coalesce(new.description, ''))
         is distinct from (old.title, old.scheduled_date, old.steps, coalesce(old.description, '')) then
    perform private.notify(new.athlete_id, 'workout_updated', 'Workout updated: ' || new.title,
      'Now ' || day || '. Check the details before you go.', href, 'workout:' || new.id || ':updated', '{}', new.coach_id);
  end if;
  return new;
end;
$$;

create trigger notify_planned_workout
  after insert or update on public.planned_workouts
  for each row execute function private.on_planned_workout();

-- ---------------------------------------------------------------- athletes: pods

create or replace function private.on_pod_member()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  pod public.pods;
begin
  select * into pod from public.pods where id = new.pod_id;
  if pod.id is null then return new; end if;

  if new.status = 'invited' and (tg_op = 'INSERT' or old.status is distinct from 'invited') then
    perform private.notify(new.athlete_id, 'pod_invite', 'You''re invited to ' || pod.name,
      'Join to share training with your pod.', '/me/pods', 'pod:' || pod.id || ':invite', '{}', pod.coach_id);
  elsif tg_op = 'UPDATE' and old.status = 'invited' and new.status in ('active', 'declined') then
    perform private.notify(pod.coach_id, 'pod_answer',
      private.display_name(new.athlete_id) || case when new.status = 'active' then ' joined ' else ' declined ' end || pod.name,
      null, '/pods/' || pod.id, 'pod:' || pod.id || ':answer:' || new.athlete_id, '{}', new.athlete_id);
  end if;
  return new;
end;
$$;

create trigger notify_pod_member
  after insert or update of status on public.pod_members
  for each row execute function private.on_pod_member();

-- Props: one row per sender, recipient and hour, with the counts added up per sticker.
create or replace function private.on_pod_props()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  key text := 'props:' || new.from_id || ':' || to_char(new.created_at at time zone 'utc', 'YYYYMMDDHH24');
  prior jsonb;
  stickers jsonb;
  total bigint;
begin
  select meta into prior from public.notifications where user_id = new.to_id and dedupe_key = key;
  stickers := coalesce(prior -> 'stickers', '{}'::jsonb);
  stickers := stickers || jsonb_build_object(new.sticker, coalesce((stickers ->> new.sticker)::bigint, 0) + new.count);
  select sum(value::bigint) into total from jsonb_each_text(stickers);

  perform private.notify(new.to_id, 'pod_props', private.display_name(new.from_id) || ' sent you props',
    case when new.note is not null or coalesce((prior ->> 'note')::boolean, false) then 'With a note.' else null end,
    '/me/pods/' || new.pod_id, key,
    jsonb_build_object('stickers', stickers, 'total', total, 'pod_id', new.pod_id,
                       'note', new.note is not null or coalesce((prior ->> 'note')::boolean, false)), new.from_id);
  return new;
end;
$$;

create trigger notify_pod_props
  after insert on public.pod_props
  for each row execute function private.on_pod_props();

-- ---------------------------------------------------------------- coaches

create or replace function private.on_ai_suggestion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'pending' or private.is_test_profile(new.athlete_id) then return new; end if;
  perform private.notify(new.coach_id, 'ai_suggestion', 'Suggestion for ' || private.display_name(new.athlete_id),
    left(new.summary, 300), '/athlete/' || new.athlete_id, 'suggestion:' || new.id, '{}', null);
  return new;
end;
$$;

create trigger notify_ai_suggestion
  after insert on public.ai_suggestions
  for each row execute function private.on_ai_suggestion();

create or replace function private.on_form_insight()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'pending' or private.is_test_profile(new.athlete_id) then return new; end if;
  perform private.notify(new.coach_id, 'form_insight', 'Form insight for ' || private.display_name(new.athlete_id),
    left(new.summary, 300), '/athlete/' || new.athlete_id, 'form:' || new.id, '{}', null);
  return new;
end;
$$;

create trigger notify_form_insight
  after insert on public.form_insights
  for each row execute function private.on_form_insight();

create or replace function private.on_invite_accepted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  athlete uuid;
begin
  if old.accepted_at is not null or new.accepted_at is null then return new; end if;
  select id into athlete from public.profiles where lower(email) = lower(new.email) limit 1;
  perform private.notify(new.coach_id, 'athlete_joined', case when athlete is null then new.email else private.display_name(athlete) end || ' joined Diastole',
    'Next: they connect their watch.', case when athlete is null then '/athletes' else '/athlete/' || athlete end,
    'joined:' || new.id, '{}', athlete);
  return new;
end;
$$;

create trigger notify_invite_accepted
  after update of accepted_at on public.invites
  for each row execute function private.on_invite_accepted();

create or replace function private.on_device_disconnected()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  coach uuid;
begin
  if old.source <> 'garmin' then return old; end if;
  select coach_id into coach from public.profiles where id = old.athlete_id;
  if coach is null or coach = old.athlete_id then return old; end if;
  perform private.notify(coach, 'garmin_disconnected', private.display_name(old.athlete_id) || '''s Garmin disconnected',
    'New workouts and data won''t sync until they reconnect.', '/athlete/' || old.athlete_id,
    'garmin-off:' || old.athlete_id || ':' || to_char(now() at time zone 'utc', 'YYYYMMDD'), '{}', old.athlete_id);
  return old;
end;
$$;

create trigger notify_device_disconnected
  after delete on public.device_connections
  for each row execute function private.on_device_disconnected();

-- ---------------------------------------------------------------- push device tokens (iOS, Phase 14)

create table public.push_tokens (
  token         text primary key check (length(token) between 16 and 512),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  platform      text not null check (platform in ('ios', 'web')),
  environment   text not null default 'production' check (environment in ('sandbox', 'production')),
  app_version   text check (app_version is null or length(app_version) <= 40),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
create policy "See own push tokens" on public.push_tokens for select using (user_id = auth.uid());
create policy "Remove own push tokens" on public.push_tokens for delete using (user_id = auth.uid());

-- The app calls this on launch. A device that changes hands (sign out, someone else signs in)
-- moves to the new user.
create or replace function public.register_push_token(p_token text, p_platform text, p_environment text default 'production', p_app_version text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  insert into public.push_tokens (token, user_id, platform, environment, app_version)
  values (p_token, auth.uid(), p_platform, coalesce(p_environment, 'production'), p_app_version)
  on conflict (token) do update
    set user_id = auth.uid(), platform = excluded.platform, environment = excluded.environment,
        app_version = excluded.app_version, last_seen_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql security definer set search_path = ''
as $$ delete from public.push_tokens where token = p_token and user_id = auth.uid(); $$;

revoke all on function public.register_push_token(text, text, text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text, text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

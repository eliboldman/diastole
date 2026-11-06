-- Phase 9c: private coach safety net. Written only by the morning job (service role); read and
-- decided only by the athlete's own coach. Athletes and pods can never read these rows.

create table public.safety_notes (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  created_on  date not null,
  updated_on  date not null,
  signals     jsonb not null,
  signal_count smallint not null check (signal_count between 2 and 3),
  summary     text not null check (char_length(summary) <= 500),
  status      text not null default 'open' check (status in ('open', 'talked', 'dismissed')),
  decided_at  timestamptz,
  unique (athlete_id, created_on)
);
create index safety_notes_coach_open on public.safety_notes (coach_id, status, updated_on desc);
alter table public.safety_notes enable row level security;
-- The athlete being the coach (a coach on their own roster) still only sees it as the coach.
create policy "safety_notes: their coach reads" on public.safety_notes for select to authenticated
  using (coach_id = auth.uid() and public.is_coach_of(athlete_id));
grant select on public.safety_notes to authenticated;
-- No insert/update/delete for signed-in users: the morning job writes, the coach decides via the function.

-- Returns null when saved, or a message saying why not.
create or replace function public.decide_safety_note(p_id uuid, p_status text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare n public.safety_notes;
begin
  select * into n from public.safety_notes where id = p_id;
  if n.id is null or n.coach_id <> auth.uid() or not public.is_coach_of(n.athlete_id) then return 'Note not found.'; end if;
  if p_status is null or p_status not in ('talked', 'dismissed') then return 'Unknown choice.'; end if;
  update public.safety_notes set status = p_status, decided_at = now() where id = p_id;
  return null;
end;
$$;
revoke all on function public.decide_safety_note(uuid, text) from public, anon;
grant execute on function public.decide_safety_note(uuid, text) to authenticated;

-- Bell notification for the coach only (coaching group). No numbers in it.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note'));

create or replace function private.notify_group(p_kind text, p_meta jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_kind = 'pod_props' and coalesce((p_meta ->> 'comment')::boolean, false) then 'comments'
    when p_kind = 'pod_props' then 'props'
    when p_kind = 'message' then 'messages'
    when p_kind in ('pod_invite', 'pod_answer') then 'pods'
    when p_kind like 'workout\_%' then 'workouts'
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined', 'checkin_pain', 'briefs_ready', 'safety_note') then 'coaching'
    else null end;
$$;

create or replace function public.notify_safety_note(p_note uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare n public.safety_notes; who text;
begin
  select * into n from public.safety_notes where id = p_note;
  if n.id is null then return; end if;
  select coalesce(nullif(split_part(full_name, ' ', 1), ''), 'an athlete') into who from public.profiles where id = n.athlete_id;
  perform private.notify(n.coach_id, 'safety_note', 'A private fueling note about ' || who,
    'Only you can see this.', '/athlete/' || n.athlete_id || '#safety', 'safety:' || n.id, '{}'::jsonb, null);
end;
$$;
revoke all on function public.notify_safety_note(uuid) from public, anon, authenticated;

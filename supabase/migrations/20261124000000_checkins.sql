-- Phase 5: the post-workout check-in. How it felt, how hard (RPE), where it hurts, a note.
-- Visible to the athlete and their coach only (never to pods). Pain flagged moderate or severe
-- notifies the coach (their "coaching" notification setting applies).

create table public.workout_checkins (
  activity_id  uuid primary key references public.activities (id) on delete cascade,
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  feel         smallint check (feel between 1 and 5),        -- 1 awful .. 5 great
  rpe          smallint check (rpe between 1 and 10),        -- session RPE (CR10)
  pain         jsonb not null default '{}',                  -- {"knee_l": 2, "lower_back": 1}: 1 mild, 2 moderate, 3 severe
  note         text check (note is null or length(note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index workout_checkins_athlete on public.workout_checkins (athlete_id, created_at desc);
alter table public.workout_checkins enable row level security;

create or replace function private.valid_pain(p jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_each(p) e
      where e.key !~ '^(neck|upper_back|lower_back|chest|abs|(shoulder|elbow|wrist|hip|groin|quad|hamstring|knee|shin|calf|ankle|foot)_[lr])$'
         or jsonb_typeof(e.value) <> 'number' or (e.value)::text::numeric not in (1, 2, 3)
    );
$$;

create policy "checkins: read" on public.workout_checkins for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
create policy "checkins: own insert" on public.workout_checkins for insert to authenticated
  with check (
    athlete_id = auth.uid()
    and exists (select 1 from public.activities a where a.id = activity_id and a.athlete_id = auth.uid())
    and private.valid_pain(pain)
  );
create policy "checkins: own update" on public.workout_checkins for update to authenticated
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid() and private.valid_pain(pain));
grant select, insert, update on public.workout_checkins to authenticated;

-- Pain worth a coach's attention: tell them, once per workout (updates refresh the same row).
create or replace function private.on_checkin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  worst int;
  spots text;
  coach uuid;
  sport text;
begin
  select max((value)::text::int) into worst from jsonb_each(new.pain);
  if coalesce(worst, 0) < 2 then return new; end if;
  select coach_id into coach from public.profiles where id = new.athlete_id;
  if coach is null or coach = new.athlete_id then return new; end if;
  select string_agg(
           replace(replace(replace(key, '_l', ' (left)'), '_r', ' (right)'), '_', ' ')
           || case (value)::text::int when 3 then ', severe' when 2 then ', moderate' else '' end, '; ')
    into spots from jsonb_each(new.pain) where (value)::text::int >= 2;
  select coalesce(nullif(replace(a.sport, '_', ' '), ''), 'workout') into sport from public.activities a where a.id = new.activity_id;
  perform private.notify(coach, 'checkin_pain',
    private.display_name(new.athlete_id) || ' flagged pain after a ' || sport,
    spots || coalesce(' · "' || left(new.note, 80) || '"', ''),
    '/activity/' || new.activity_id || '#checkin', 'pain:' || new.activity_id,
    jsonb_build_object('activity_id', new.activity_id, 'athlete_id', new.athlete_id, 'worst', worst), new.athlete_id);
  return new;
end;
$$;
create trigger notify_checkin after insert or update of pain on public.workout_checkins
  for each row execute function private.on_checkin();

-- Pain alerts belong to the coach's "coaching" notification group.
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
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined', 'checkin_pain') then 'coaching'
    else null end;
$$;

-- The notifications table only accepts known kinds.
do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'public.notifications'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if c is not null then execute format('alter table public.notifications drop constraint %I', c); end if;
end $$;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain'));

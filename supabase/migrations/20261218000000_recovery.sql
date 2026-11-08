-- Recovery library: coach demo videos, routines, assignments, finished sessions, and a private
-- heads-up to the coach when the same sore spot keeps coming up. General recovery guidance only.

-- ---------------------------------------------------------------- demo videos
-- Public bucket: short muted demo clips of the coach, no personal data. Written only by the upload
-- script (service role); the catalog itself lives in code (lib/recovery/catalog.ts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recovery', 'recovery', true, 20971520, array['video/mp4', 'image/jpeg'])
on conflict (id) do nothing;

-- Which catalog moves have a clip (slug = catalog id), so the player knows what to load.
create table public.recovery_videos (
  slug        text primary key check (slug ~ '^[a-z0-9-]{2,60}$'),
  path        text not null,
  poster      text,
  seconds     numeric,
  updated_at  timestamptz not null default now()
);
alter table public.recovery_videos enable row level security;
create policy "recovery videos: signed-in read" on public.recovery_videos for select to authenticated using (true);
grant select on public.recovery_videos to authenticated;

-- ---------------------------------------------------------------- routines
-- items: [{"slug": "foam-roll-calves", "seconds": 45}], seconds per side for per-side moves.
create table public.recovery_routines (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (length(trim(title)) between 1 and 80),
  description  text check (description is null or length(description) <= 300),
  items        jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index recovery_routines_coach on public.recovery_routines (coach_id, updated_at desc);
create trigger recovery_routines_touch before update on public.recovery_routines
  for each row execute function public.touch_updated_at();
alter table public.recovery_routines enable row level security;
create policy "recovery routines: coach manages" on public.recovery_routines for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid() and public.is_coach());
-- Athletes see their coach's routines (to start one themselves or from a suggestion).
create policy "recovery routines: athletes read" on public.recovery_routines for select to authenticated
  using (coach_id = (select p.coach_id from public.profiles p where p.id = auth.uid()));
grant select, insert, update, delete on public.recovery_routines to authenticated;

-- ---------------------------------------------------------------- assignments
-- A routine on an athlete's day. A copy of the items, so later edits don't change what was sent.
create table public.recovery_assignments (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references public.profiles (id) on delete cascade,
  coach_id        uuid not null references public.profiles (id) on delete cascade,
  routine_id      uuid references public.recovery_routines (id) on delete set null,
  title           text not null check (length(trim(title)) between 1 and 80),
  items           jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  scheduled_date  date not null,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index recovery_assignments_athlete on public.recovery_assignments (athlete_id, scheduled_date);
alter table public.recovery_assignments enable row level security;
create policy "recovery assignments: coach manages" on public.recovery_assignments for all to authenticated
  using (coach_id = auth.uid() and public.is_coach_of(athlete_id))
  with check (coach_id = auth.uid() and public.is_coach_of(athlete_id));
create policy "recovery assignments: athlete reads" on public.recovery_assignments for select to authenticated
  using (athlete_id = auth.uid());
grant select, insert, update, delete on public.recovery_assignments to authenticated;

-- ---------------------------------------------------------------- finished sessions
create table public.recovery_sessions (
  id             uuid primary key default gen_random_uuid(),
  athlete_id     uuid not null references public.profiles (id) on delete cascade,
  assignment_id  uuid references public.recovery_assignments (id) on delete set null,
  title          text not null check (length(title) between 1 and 80),
  seconds        int not null check (seconds between 1 and 7200),
  source         text not null check (source in ('assigned', 'suggested', 'self')),
  completed_at   timestamptz not null default now()
);
create index recovery_sessions_athlete on public.recovery_sessions (athlete_id, completed_at desc);
alter table public.recovery_sessions enable row level security;
create policy "recovery sessions: athlete adds own" on public.recovery_sessions for insert to authenticated
  with check (athlete_id = auth.uid());
create policy "recovery sessions: athlete or coach reads" on public.recovery_sessions for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select, insert on public.recovery_sessions to authenticated;

-- Finishing an assigned routine marks the assignment done (athletes can't update assignments).
create or replace function private.on_recovery_session()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.assignment_id is not null then
    update public.recovery_assignments set completed_at = coalesce(completed_at, new.completed_at)
     where id = new.assignment_id and athlete_id = new.athlete_id;
  end if;
  return new;
end;
$$;
create trigger recovery_session_done after insert on public.recovery_sessions
  for each row execute function private.on_recovery_session();

-- ---------------------------------------------------------------- notifications
-- workout_recovery: the coach assigned a routine (athlete; grouped with workouts by its prefix).
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated', 'weekly_digest', 'workout_pack', 'workout_shoes', 'pod_challenge', 'workout_recap', 'monthly_digest',
  'workout_request', 'workout_declined', 'workout_recovery'));

-- ---------------------------------------------------------------- the same sore spot again
-- Check-ins already alert the coach about moderate or severe pain. Now also: any spot flagged in 3
-- or more check-ins within 14 days gets one private heads-up per spot per week.
create or replace function private.on_checkin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  worst int;
  spots text;
  coach uuid;
  sport text;
  s record;
  times int;
begin
  select coach_id into coach from public.profiles where id = new.athlete_id;
  if coach is null or coach = new.athlete_id then return new; end if;

  for s in select key from jsonb_each(new.pain) loop
    select count(*) into times from public.workout_checkins c
     where c.athlete_id = new.athlete_id and c.created_at > now() - interval '14 days' and c.pain ? s.key;
    if times >= 3 then
      perform private.notify(coach, 'checkin_pain',
        private.display_name(new.athlete_id) || ' keeps flagging the same spot',
        replace(replace(replace(s.key, '_l', ' (left)'), '_r', ' (right)'), '_', ' ')
          || ': ' || times || ' check-ins in the last 2 weeks. Worth a quick check-in.',
        '/activity/' || new.activity_id || '#checkin',
        'pain_repeat:' || new.athlete_id || ':' || s.key || ':' || to_char(now(), 'IYYY-IW'),
        jsonb_build_object('athlete_id', new.athlete_id, 'spot', s.key, 'times', times), new.athlete_id);
    end if;
  end loop;

  select max((value)::text::int) into worst from jsonb_each(new.pain);
  if coalesce(worst, 0) < 2 then return new; end if;
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

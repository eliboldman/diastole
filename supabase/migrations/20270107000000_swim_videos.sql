-- Stroke videos: an athlete uploads a short pool clip; their coach watches it and replies with a
-- note. Private bucket, one folder per athlete. Only the two newest clips per athlete are kept
-- (older ones are removed by the server when a new one arrives) so storage stays small.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('swim-video', 'swim-video', false, 52428800, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

-- Path is "<athlete id>/<uuid>.<ext>".
create policy "swim video: athlete uploads own" on storage.objects for insert to authenticated
  with check (bucket_id = 'swim-video' and split_part(name, '/', 1) = auth.uid()::text);
create policy "swim video: athlete and coach read" on storage.objects for select to authenticated
  using (bucket_id = 'swim-video' and (
    split_part(name, '/', 1) = auth.uid()::text
    or (split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$' and public.is_coach_of(split_part(name, '/', 1)::uuid))));
create policy "swim video: athlete deletes own" on storage.objects for delete to authenticated
  using (bucket_id = 'swim-video' and split_part(name, '/', 1) = auth.uid()::text);

create table public.swim_videos (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  path         text not null unique,
  bytes        integer check (bytes is null or bytes between 1 and 52428800),
  athlete_note text check (athlete_note is null or char_length(athlete_note) <= 300),
  coach_note   text check (coach_note is null or char_length(coach_note) <= 1000),
  coach_seen   timestamptz,
  replied_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index swim_videos_athlete on public.swim_videos (athlete_id, created_at desc);
alter table public.swim_videos enable row level security;
-- Reads only; rows are written by server actions (admin client) after checking who's asking.
create policy "swim videos: athlete and coach read" on public.swim_videos for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select on public.swim_videos to authenticated;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready', 'safety_note',
  'zones_updated', 'weekly_digest', 'workout_pack', 'workout_shoes', 'pod_challenge', 'workout_recap', 'monthly_digest',
  'workout_request', 'workout_declined', 'workout_recovery', 'plan_change', 'workout_changed',
  'zone_suggestion', 'session_missed', 'bedtime_recap', 'swim_video'));

-- Bell + push: the coach when a clip arrives, the athlete when the coach replies.
create or replace function private.swim_video_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_coach uuid;
  v_name text;
begin
  if tg_op = 'INSERT' then
    select coach_id, split_part(coalesce(full_name, 'An athlete'), ' ', 1) into v_coach, v_name
      from public.profiles where id = new.athlete_id;
    perform private.notify(v_coach, 'swim_video', v_name || ' sent a stroke video',
      coalesce(new.athlete_note, 'Tap to watch and reply.'), '/athlete/' || new.athlete_id || '#swim',
      'swim_video:' || new.id, '{}'::jsonb, new.athlete_id);
  elsif new.coach_note is distinct from old.coach_note and new.coach_note is not null then
    select coach_id into v_coach from public.profiles where id = new.athlete_id;
    perform private.notify(new.athlete_id, 'swim_video', 'Your coach replied to your stroke video',
      left(new.coach_note, 140), '/training#swim', 'swim_video_reply:' || new.id, '{}'::jsonb, v_coach);
  end if;
  return new;
end;
$$;
create trigger swim_video_notify after insert or update of coach_note on public.swim_videos
  for each row execute function private.swim_video_notify();

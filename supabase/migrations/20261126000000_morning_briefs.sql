-- Phase 7: morning briefs. Each morning Claude drafts a short note per athlete in the coach's voice;
-- the coach edits, sends (as an ordinary chat message from the coach) or skips each one.
-- Drafts are coach-only: athletes see a brief only as the message the coach sent.

create table public.morning_briefs (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles (id) on delete cascade,
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  date         date not null,                -- the athlete's local date
  draft        text not null check (length(draft) between 1 and 1200),
  status       text not null default 'pending' check (status in ('pending', 'sent', 'skipped')),
  final_text   text check (final_text is null or length(final_text) between 1 and 2000),
  message_id   uuid references public.messages (id) on delete set null,
  model        text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  unique (coach_id, athlete_id, date)
);
create index morning_briefs_coach_date on public.morning_briefs (coach_id, date desc);
alter table public.morning_briefs enable row level security;
create policy "briefs: coach reads" on public.morning_briefs for select to authenticated using (coach_id = auth.uid());
grant select on public.morning_briefs to authenticated;
-- Writes go through the server (drafting) and the decide function below.

create or replace function public.decide_brief(p_id uuid, p_status text, p_text text default null, p_message uuid default null)
returns void
language sql security definer set search_path = ''
as $$
  update public.morning_briefs
     set status = p_status, final_text = case when p_status = 'sent' then p_text end,
         message_id = case when p_status = 'sent' then p_message end, decided_at = now()
   where id = p_id and coach_id = auth.uid() and p_status in ('sent', 'skipped');
$$;
revoke all on function public.decide_brief(uuid, text, text, uuid) from public, anon;
grant execute on function public.decide_brief(uuid, text, text, uuid) to authenticated;

alter table public.ai_usage drop constraint ai_usage_trigger_check;
alter table public.ai_usage add constraint ai_usage_trigger_check check (trigger in ('cron', 'manual', 'test', 'form', 'why', 'brief', 'build'));

-- "Your morning briefs are ready" for the coach (coaching group).
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workout_sent', 'workout_updated', 'workout_removed', 'pod_invite', 'pod_props', 'ai_suggestion', 'form_insight',
  'athlete_joined', 'pod_answer', 'garmin_disconnected', 'message', 'checkin_pain', 'briefs_ready'));

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
    when p_kind in ('ai_suggestion', 'form_insight', 'athlete_joined', 'checkin_pain', 'briefs_ready') then 'coaching'
    else null end;
$$;

-- Called by the server after drafting (the drafter has no user session, so the actor is the coach).
create or replace function public.notify_briefs_ready(p_coach uuid, p_count integer, p_date date)
returns void
language sql security definer set search_path = ''
as $$
  select private.notify(p_coach, 'briefs_ready',
    case when p_count = 1 then 'Your morning brief is ready' else p_count || ' morning briefs are ready' end,
    'Review, edit and send from Today.', '/dashboard#briefs', 'briefs:' || p_date, '{}'::jsonb, null);
$$;
revoke all on function public.notify_briefs_ready(uuid, integer, date) from public, anon, authenticated;

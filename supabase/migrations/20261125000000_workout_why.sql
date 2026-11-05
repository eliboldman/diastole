-- Phase 6: the "why" behind each planned workout.
-- * planned_workouts.why: the coach-approved explanation the athlete sees (row-level security on
--   planned_workouts already hides drafts-status workouts from athletes).
-- * workout_why_drafts: AI drafts, coach-only, until the coach edits and saves one into `why`.
--   Nothing AI-written reaches an athlete without that step.

alter table public.planned_workouts
  add column why text check (why is null or length(why) between 1 and 400),
  add column why_updated_at timestamptz;

create table public.workout_why_drafts (
  workout_id  uuid primary key references public.planned_workouts (id) on delete cascade,
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  draft       text not null check (length(draft) between 1 and 600),
  model       text not null,
  created_at  timestamptz not null default now()
);
alter table public.workout_why_drafts enable row level security;
create policy "why drafts: coach reads" on public.workout_why_drafts for select to authenticated
  using (exists (select 1 from public.planned_workouts w where w.id = workout_id and w.coach_id = auth.uid()));
create policy "why drafts: coach clears" on public.workout_why_drafts for delete to authenticated
  using (exists (select 1 from public.planned_workouts w where w.id = workout_id and w.coach_id = auth.uid()));
grant select, delete on public.workout_why_drafts to authenticated;

alter table public.ai_usage drop constraint ai_usage_trigger_check;
alter table public.ai_usage add constraint ai_usage_trigger_check check (trigger in ('cron', 'manual', 'test', 'form', 'why'));

-- Confidence bank: proof the athlete is ready. Saved automatically from their own training (longest
-- sessions, bricks, PRs, tough sessions on low-readiness days, coach praise, their own upbeat notes)
-- plus entries they add. The athlete and their coach see it; pods never do.

create table public.confidence_entries (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('long', 'brick', 'pr', 'tough', 'praise', 'note', 'own')),
  ref          text not null check (length(ref) between 1 and 120),
  title        text not null check (length(btrim(title)) between 1 and 120),
  detail       text check (detail is null or length(detail) <= 400),
  date         date not null,
  activity_id  uuid references public.activities (id) on delete set null,
  hidden       boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (athlete_id, kind, ref)
);
create index confidence_entries_athlete on public.confidence_entries (athlete_id, date desc);
alter table public.confidence_entries enable row level security;
create policy "confidence: athlete or coach reads" on public.confidence_entries for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select on public.confidence_entries to authenticated;

-- Swim stroke insights: the coach's approved drill focus for an athlete, dismissed suggestions,
-- an optional note, and whether they've asked for a stroke video. Insights are computed on the fly.
create table public.swim_coaching (
  athlete_id   uuid primary key references public.profiles (id) on delete cascade,
  focus        jsonb not null default '[]',  -- approved drill keys, in order
  dismissed    jsonb not null default '{}',  -- {drill key: date dismissed}
  note         text check (note is null or char_length(note) <= 500),
  video_asked  boolean not null default false,
  updated_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now()
);
alter table public.swim_coaching enable row level security;
create policy "swim_coaching: athlete reads" on public.swim_coaching for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
create policy "swim_coaching: coach writes" on public.swim_coaching for all to authenticated
  using (public.is_coach_of(athlete_id)) with check (public.is_coach_of(athlete_id));
grant select, insert, update, delete on public.swim_coaching to authenticated;

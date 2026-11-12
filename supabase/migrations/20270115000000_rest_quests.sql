-- Rest day quests. The quest list itself lives in the app (lib/quests); coaches can add their own,
-- for one athlete or their whole roster. Completing one earns grit; skipping costs nothing.

create table public.rest_quests (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  athlete_id  uuid references public.profiles (id) on delete cascade, -- null = every athlete of this coach
  title       text not null check (length(btrim(title)) between 1 and 60),
  blurb       text check (blurb is null or length(blurb) <= 140),
  grit        integer not null default 10 check (grit between 5 and 25),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index rest_quests_coach on public.rest_quests (coach_id, active);
alter table public.rest_quests enable row level security;
create policy "rest quests: coach manages" on public.rest_quests for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and public.is_coach() and (athlete_id is null or public.is_coach_of(athlete_id)));
create policy "rest quests: athletes read theirs" on public.rest_quests for select to authenticated
  using (active and coach_id = public.my_coach_id() and (athlete_id is null or athlete_id = auth.uid()));
grant select, insert, update, delete on public.rest_quests to authenticated;

-- Done quests (written by the server after it checks the quest was offered today).
create table public.quest_completions (
  athlete_id    uuid not null references public.profiles (id) on delete cascade,
  date          date not null,
  quest_key     text not null check (quest_key ~ '^(c:[0-9a-f-]{36}|[a-z_]{1,30})$'),
  title         text not null check (length(title) between 1 and 60),
  grit          integer not null check (grit between 1 and 25),
  auto          boolean not null default false,
  completed_at  timestamptz not null default now(),
  primary key (athlete_id, date, quest_key)
);
alter table public.quest_completions enable row level security;
create policy "quest completions: athlete or coach reads" on public.quest_completions for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select on public.quest_completions to authenticated;

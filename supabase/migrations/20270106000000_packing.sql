-- Race packing list rebuild: the athlete's ticks, own items, travel and water temperature per race,
-- and the coach's master list merged into every athlete's list.
alter table public.races add column pack jsonb not null default '{}';

create table public.coach_pack_lists (
  coach_id    uuid primary key references public.profiles (id) on delete cascade,
  items       jsonb not null default '[]', -- [{label, bag, sports[]}]
  updated_at  timestamptz not null default now()
);
alter table public.coach_pack_lists enable row level security;
create policy "coach_pack_lists: own" on public.coach_pack_lists for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
grant select, insert, update, delete on public.coach_pack_lists to authenticated;
-- Athletes get their coach's list through the server (merged into their packing list).

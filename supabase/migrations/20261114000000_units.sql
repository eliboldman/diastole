-- Display units: miles (default; US college athletes) or kilometres. Each person picks their own.
alter table public.profiles add column units text not null default 'mi' check (units in ('mi', 'km'));
grant update (units) on public.profiles to authenticated;

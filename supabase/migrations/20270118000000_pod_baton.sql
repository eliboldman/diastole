-- Pod baton: an invisible baton that passes to the next opted-in pod member each time the holder
-- finishes a workout. Rest days and "life happened" pass it on without breaking the chain.
-- Written by the server; pod members (and the pod's coach) read it.

alter table public.pod_members add column baton boolean not null default false;

create table public.pod_batons (
  pod_id      uuid primary key references public.pods (id) on delete cascade,
  holder_id   uuid references public.profiles (id) on delete set null,
  since       timestamptz,
  handoffs    integer not null default 0,
  chain       integer not null default 0,
  longest     integer not null default 0,
  nudged_at   timestamptz,
  updated_at  timestamptz not null default now()
);
alter table public.pod_batons enable row level security;
create policy "pod batons: pod reads" on public.pod_batons for select to authenticated using (public.in_pod(pod_id));
grant select on public.pod_batons to authenticated;

create table public.baton_passes (
  id           bigint generated always as identity primary key,
  pod_id       uuid not null references public.pods (id) on delete cascade,
  from_id      uuid references public.profiles (id) on delete set null,
  to_id        uuid references public.profiles (id) on delete set null,
  kind         text not null check (kind in ('start', 'pass', 'skip', 'hop')),
  activity_id  uuid references public.activities (id) on delete set null,
  passed_at    timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (pod_id, activity_id) -- one pass per workout (nulls, for skips and hops, don't clash)
);
create index baton_passes_pod on public.baton_passes (pod_id, passed_at desc);
alter table public.baton_passes enable row level security;
create policy "baton passes: pod reads" on public.baton_passes for select to authenticated using (public.in_pod(pod_id));
grant select on public.baton_passes to authenticated;

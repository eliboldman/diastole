-- Pod campfire: Sunday evening to Monday morning (the coach's time), each member can add a log with
-- one highlight and one struggle from their week (text, a voice note or a photo). The coach can drop
-- in a voice note. Only the pod sees it. Highlights later feed the pod's weekly storyline.

create table public.campfires (
  id         uuid primary key default gen_random_uuid(),
  pod_id     uuid not null references public.pods (id) on delete cascade,
  week       date not null, -- the Sunday
  opens_at   timestamptz not null,
  closes_at  timestamptz not null,
  created_at timestamptz not null default now(),
  unique (pod_id, week)
);
alter table public.campfires enable row level security;
create policy "campfires: pod reads" on public.campfires for select to authenticated using (public.in_pod(pod_id));
grant select on public.campfires to authenticated;

create table public.campfire_logs (
  id           uuid primary key default gen_random_uuid(),
  campfire_id  uuid not null references public.campfires (id) on delete cascade,
  pod_id       uuid not null references public.pods (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  is_coach     boolean not null default false,
  highlight    text check (highlight is null or length(highlight) <= 280),
  struggle     text check (struggle is null or length(struggle) <= 280),
  h_media      text check (h_media is null or length(h_media) <= 200),
  h_kind       text check (h_kind is null or h_kind in ('voice', 'photo')),
  s_media      text check (s_media is null or length(s_media) <= 200),
  s_kind       text check (s_kind is null or s_kind in ('voice', 'photo')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (campfire_id, author_id)
);
create index campfire_logs_pod on public.campfire_logs (pod_id, created_at desc);
alter table public.campfire_logs enable row level security;
create policy "campfire logs: pod reads" on public.campfire_logs for select to authenticated using (public.in_pod(pod_id));
grant select on public.campfire_logs to authenticated;

-- Voice notes and photos: private, pod members only. Path: <pod id>/<author id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campfire', 'campfire', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac'])
on conflict (id) do nothing;

create or replace function public.campfire_path_pod(p_name text)
returns uuid
language sql immutable set search_path = ''
as $$ select case when split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(p_name, '/', 1)::uuid end; $$;

create policy "campfire media: pod reads" on storage.objects for select to authenticated
  using (bucket_id = 'campfire' and public.in_pod(public.campfire_path_pod(name)));
create policy "campfire media: members upload their own" on storage.objects for insert to authenticated
  with check (bucket_id = 'campfire' and public.in_pod(public.campfire_path_pod(name)) and split_part(name, '/', 2) = auth.uid()::text);
create policy "campfire media: uploader deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'campfire' and owner_id = auth.uid()::text);

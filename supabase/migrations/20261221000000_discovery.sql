-- Discovery: one-time spotlight tips and "What's new" cards the person has dismissed, so they
-- never repeat (on any device). Ids like "tip:life-happened" or "new:2026-11b".
alter table public.profiles add column seen_tips text[] not null default '{}'
  check (cardinality(seen_tips) <= 300);
grant update (seen_tips) on public.profiles to authenticated;

-- Walkthrough videos and other public app media (written only by the upload script).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800, array['video/mp4', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

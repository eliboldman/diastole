-- Pod storylines: a weekly "episode" recapping the pod's week. The assistant drafts it in the coach's
-- voice from what each member shares with the pod; nothing is posted until the coach approves or
-- edits it. Posted episodes form the season archive.

create table public.storylines (
  id          uuid primary key default gen_random_uuid(),
  pod_id      uuid not null references public.pods (id) on delete cascade,
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  week        date not null, -- Monday of the week it recaps
  season      integer not null, -- year
  episode     integer not null,
  title       text not null check (length(btrim(title)) between 1 and 90),
  body        text not null check (length(body) between 1 and 3000),
  status      text not null check (status in ('draft', 'posted', 'discarded')),
  model       text,
  cost_usd    numeric,
  created_at  timestamptz not null default now(),
  posted_at   timestamptz,
  unique (pod_id, week)
);
create index storylines_pod on public.storylines (pod_id, week desc);
alter table public.storylines enable row level security;
create policy "storylines: coach reads all" on public.storylines for select to authenticated using (public.is_pod_coach(pod_id));
create policy "storylines: pod reads posted" on public.storylines for select to authenticated using (status = 'posted' and public.in_pod(pod_id));
grant select on public.storylines to authenticated;

alter table public.ai_usage drop constraint ai_usage_trigger_check;
alter table public.ai_usage add constraint ai_usage_trigger_check check (trigger in ('cron', 'manual', 'test', 'form', 'why', 'brief', 'build', 'meal', 'plan', 'swap', 'ask', 'story'));

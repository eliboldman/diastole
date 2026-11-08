-- Phase E: Secrets. What each person has found, their Easter-egg settings, and opt-in pod posts
-- when someone finds one. Playful only; never tied to nutrition, weight or health struggles.

-- secret_id: blocks, icarus, heartbeat, night_shift, receipt (more in later releases).
-- count: how many times it's been earned (Night Shift tiers), enabled: the person's on/off switch.
create table public.user_secrets (
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  secret_id   text not null check (secret_id ~ '^[a-z_]{2,30}$'),
  found_at    timestamptz not null default now(),
  count       int not null default 1 check (count between 1 and 100000),
  enabled     boolean not null default true,
  primary key (athlete_id, secret_id)
);
alter table public.user_secrets enable row level security;
create policy "secrets: own" on public.user_secrets for all to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
grant select, insert, update, delete on public.user_secrets to authenticated;

-- {"on": true, "sparkle": true, "podPosts": false, "heartbeat": "soft"|"sharp"|"pixel"|"off", "night": "day"|"keep"}
alter table public.profiles add column eggs jsonb
  check (eggs is null or (jsonb_typeof(eggs) = 'object' and length(eggs::text) < 600));
grant update (eggs) on public.profiles to authenticated;

-- "Walker discovered Night Shift": only for people who opted in (written by the server after the check).
create table public.secret_posts (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  secret_id   text not null check (secret_id ~ '^[a-z_]{2,30}$'),
  created_at  timestamptz not null default now()
);
create index secret_posts_athlete on public.secret_posts (athlete_id, created_at desc);
alter table public.secret_posts enable row level security;
grant select on public.secret_posts to authenticated;
create policy "secret posts: own" on public.secret_posts for select to authenticated using (athlete_id = auth.uid());

-- A pod's recent discoveries: active members' posts, for members and the pod's coach.
create or replace function public.get_pod_secret_posts(p_pod uuid)
returns table (athlete_id uuid, first_name text, secret_id text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.athlete_id, coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'Someone'), s.secret_id, s.created_at
  from public.secret_posts s
  join public.pod_members m on m.athlete_id = s.athlete_id and m.pod_id = p_pod and m.status = 'active'
  join public.profiles p on p.id = s.athlete_id
  where public.in_pod(p_pod) and s.created_at > now() - interval '30 days'
  order by s.created_at desc
  limit 8;
$$;
revoke all on function public.get_pod_secret_posts(uuid) from public, anon;
grant execute on function public.get_pod_secret_posts(uuid) to authenticated;

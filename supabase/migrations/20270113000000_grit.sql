-- Grit: an effort currency. Earned from training and recovery (never bought with money), spent in
-- the store on stickers, avatar gear, themes and abilities. It never touches training.
--
-- * grit_ledger: every earn (+) and spend (-), one row each, written only by the server. The balance
--   is the sum, so it can't drift. (athlete, kind, ref) is unique, so an award can't land twice.
-- * grit_items: what the athlete owns (qty for abilities, 1 for everything else).
-- * Balances and history are the athlete's and their coach's only; pods never see them.

create table public.grit_ledger (
  id          bigint generated always as identity primary key,
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  amount      integer not null check (amount <> 0 and amount between -100000 and 100000),
  kind        text not null check (kind ~ '^[a-z_]{1,24}$'),   -- session, checkin, smart_rest, camp, challenge, quest, purchase...
  ref         text not null check (length(ref) between 1 and 120), -- what it's for (activity id, item id + nonce...)
  reason      text check (reason is null or length(reason) <= 120),
  detail      jsonb check (detail is null or pg_column_size(detail) < 2048),
  created_at  timestamptz not null default now(),
  unique (athlete_id, kind, ref)
);
create index grit_ledger_athlete on public.grit_ledger (athlete_id, created_at desc);
alter table public.grit_ledger enable row level security;
create policy "grit ledger: athlete or coach reads" on public.grit_ledger for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select on public.grit_ledger to authenticated;

create table public.grit_items (
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  item_id      text not null check (item_id ~ '^[a-z]+:[a-z0-9_]{1,40}$'), -- sticker:g_comet, jersey:stripe_mint, ability:shield...
  qty          integer not null default 1 check (qty >= 0 and qty <= 99),
  acquired_at  timestamptz not null default now(),
  primary key (athlete_id, item_id)
);
alter table public.grit_items enable row level security;
create policy "grit items: athlete or coach reads" on public.grit_items for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select on public.grit_items to authenticated;

-- When the athlete last saw their grit (the "+12 grit" pop shows anything newer once).
alter table public.profiles add column grit_seen_at timestamptz;

-- Buy one item, atomically: one purchase at a time per athlete, balance checked inside the lock.
-- Prices come from the app's catalog (server code), so only the server may call this.
-- Returns null when bought, else 'owned' | 'max' | 'short'.
create or replace function public.grit_buy(p_athlete uuid, p_item text, p_price integer, p_consumable boolean, p_max integer)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  bal bigint;
  have integer;
begin
  if p_price is null or p_price < 1 then return 'short'; end if;
  perform pg_advisory_xact_lock(hashtextextended('grit:' || p_athlete::text, 0));
  select coalesce(sum(amount), 0) into bal from public.grit_ledger where athlete_id = p_athlete;
  select qty into have from public.grit_items where athlete_id = p_athlete and item_id = p_item;
  if not p_consumable and coalesce(have, 0) > 0 then return 'owned'; end if;
  if p_consumable and coalesce(have, 0) >= p_max then return 'max'; end if;
  if bal < p_price then return 'short'; end if;
  insert into public.grit_ledger (athlete_id, amount, kind, ref, reason)
  values (p_athlete, -p_price, 'purchase', p_item || ':' || gen_random_uuid(), p_item);
  insert into public.grit_items (athlete_id, item_id, qty) values (p_athlete, p_item, 1)
  on conflict (athlete_id, item_id) do update set qty = public.grit_items.qty + 1, acquired_at = now();
  return null;
end;
$$;

-- Use one of an ability (streak shield, kudos boost). True when there was one to use.
create or replace function public.grit_use(p_athlete uuid, p_item text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.grit_items set qty = qty - 1 where athlete_id = p_athlete and item_id = p_item and qty > 0;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.grit_buy(uuid, text, integer, boolean, integer) from public, anon, authenticated;
revoke all on function public.grit_use(uuid, text) from public, anon, authenticated;
grant execute on function public.grit_buy(uuid, text, integer, boolean, integer) to service_role;
grant execute on function public.grit_use(uuid, text) to service_role;

-- ---------------------------------------------------------------- abilities
-- Streak shield: a missed planned day that doesn't break the plan streak.
create table public.grit_shields (
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  date        date not null,
  created_at  timestamptz not null default now(),
  primary key (athlete_id, date)
);
alter table public.grit_shields enable row level security;
create policy "grit shields: athlete or coach reads" on public.grit_shields for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
grant select on public.grit_shields to authenticated;

-- Kudos boost: confetti across the pod page for a day, from one member to another.
create table public.pod_boosts (
  id          uuid primary key default gen_random_uuid(),
  pod_id      uuid not null references public.pods (id) on delete cascade,
  from_id     uuid not null references public.profiles (id) on delete cascade,
  to_id       uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours'
);
create index pod_boosts_pod on public.pod_boosts (pod_id, expires_at desc);
alter table public.pod_boosts enable row level security;
create policy "pod boosts: pod reads" on public.pod_boosts for select to authenticated using (public.in_pod(pod_id));
grant select on public.pod_boosts to authenticated;

-- ---------------------------------------------------------------- avatar gear
-- Equipped gear lives in avatars.look.gear so everyone who may see the avatar sees the gear. Only
-- the server sets it (after checking the athlete owns it); athletes' own look saves keep it as is.
create or replace function private.keep_avatar_gear()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    if tg_op = 'UPDATE' and old.look ? 'gear' then
      new.look := (new.look - 'gear') || jsonb_build_object('gear', old.look -> 'gear');
    else
      new.look := new.look - 'gear';
    end if;
  end if;
  return new;
end;
$$;
create trigger avatars_keep_gear before insert or update on public.avatars
  for each row execute function private.keep_avatar_gear();

-- ---------------------------------------------------------------- store stickers
-- Stickers bought with grit (keys start with g_) can only be sent by someone who owns them.
create or replace function public.send_pod_props(p_pod uuid, p_to uuid, p_sticker text, p_count integer, p_note text default null, p_activity uuid default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clean_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
  is_comment boolean := p_sticker = 'comment';
begin
  if me is null then return 'Sign in first.'; end if;
  if p_to = me and not (is_comment and p_activity is not null) then return 'self'; end if;
  if not (coalesce(public.my_pod_status(p_pod) = 'active', false) or public.is_pod_coach(p_pod)) then
    return 'You''re not in this pod.';
  end if;
  if not exists (select 1 from public.pod_members where pod_id = p_pod and athlete_id = p_to and status = 'active') then
    return 'They''re not in this pod.';
  end if;
  if p_activity is not null and not exists (select 1 from public.activities where id = p_activity and athlete_id = p_to) then
    return 'That workout isn''t theirs.';
  end if;
  if is_comment and (p_activity is null or clean_note is null) then return 'Write something first.'; end if;
  if p_sticker !~ '^[a-z0-9_]{1,40}$' or p_count is null or p_count < 1 or p_count > 1000000 then
    return 'That sticker doesn''t exist.';
  end if;
  if p_sticker like 'g\_%' and not exists (select 1 from public.grit_items where athlete_id = me and item_id = 'sticker:' || p_sticker and qty > 0) then
    return 'Get that sticker in the Grit store first.';
  end if;
  if (select count(*) from public.pod_props where from_id = me and created_at > now() - interval '10 minutes') >= 60 then
    return 'slow';
  end if;

  if length(clean_note) > 120 then return 'Keep it to 120 characters.'; end if;

  insert into public.pod_props (pod_id, from_id, to_id, sticker, count, note, activity_id)
  values (p_pod, me, p_to, p_sticker, case when is_comment then 1 else p_count end, clean_note, p_activity);
  return null; -- null = sent
end;
$$;

-- ---------------------------------------------------------------- pod challenge awards
-- Team challenges that reached their goal: grit for everyone who added to it (rules only, once each).
create or replace function public.grit_award_challenges()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
  total numeric;
  n integer := 0;
  added integer;
begin
  for c in select * from public.pod_challenges where mode = 'team' and ends_on between current_date - 7 and current_date - 1 loop
    select coalesce(sum(value), 0) into total from private.challenge_totals(c.id);
    if total < c.goal then continue; end if;
    insert into public.grit_ledger (athlete_id, amount, kind, ref, reason)
    select t.athlete_id, 30, 'challenge', c.id::text, left('Team goal: ' || c.title, 120)
    from private.challenge_totals(c.id) t where t.value > 0
    on conflict (athlete_id, kind, ref) do nothing;
    get diagnostics added = row_count;
    n := n + added;
  end loop;
  return n;
end;
$$;
revoke all on function public.grit_award_challenges() from public, anon, authenticated;
grant execute on function public.grit_award_challenges() to service_role;

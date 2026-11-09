-- Watches and TVs signed in with a pairing code: the Garmin watch app (Connect IQ) and the Apple TV
-- ride app. The device shows a short code, the athlete types it on diastole.app while signed in,
-- and the device's next poll receives a long-lived, read-mostly token. Only hashes are stored.

-- Codes waiting to be typed in. Server-only (no policies): the API uses the service key.
create table public.device_pairings (
  code         text primary key check (code ~ '^[A-Z2-9]{6}$'),
  kind         text not null check (kind in ('garmin_watch', 'apple_tv')),
  label        text check (label is null or length(label) <= 60),
  secret_hash  text not null unique,          -- sha256 of the poll secret only the device knows
  athlete_id   uuid references public.profiles (id) on delete cascade,
  claimed_at   timestamptz,
  expires_at   timestamptz not null default now() + interval '10 minutes',
  created_at   timestamptz not null default now()
);
alter table public.device_pairings enable row level security;
revoke all on public.device_pairings from anon, authenticated;

-- Signed-in devices. Athletes see and remove their own (Me > Watch & TV apps).
create table public.device_links (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('garmin_watch', 'apple_tv')),
  label         text check (label is null or length(label) <= 60),
  token_hash    text not null unique,         -- sha256 of the bearer token
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);
create index device_links_athlete on public.device_links (athlete_id);
alter table public.device_links enable row level security;
revoke all on public.device_links from anon, authenticated;
grant select (id, athlete_id, kind, label, created_at, last_seen_at), delete on public.device_links to authenticated;
create policy "device links: own" on public.device_links for select to authenticated using (athlete_id = auth.uid());
create policy "device links: remove own" on public.device_links for delete to authenticated using (athlete_id = auth.uid());

-- Typing a code: claims it for the signed-in athlete. Returns the device kind, or an error word
-- ('invalid' | 'expired' | 'used' | 'too_many') instead of raising.
create table private.device_pair_attempts (
  athlete_id  uuid not null,
  at          timestamptz not null default now()
);
create index device_pair_attempts_athlete on private.device_pair_attempts (athlete_id, at);

create or replace function public.claim_device_code(p_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  pairing public.device_pairings;
begin
  if me is null then return 'invalid'; end if;
  -- 10 tries per 10 minutes keeps guessing someone else's code impractical.
  if (select count(*) from private.device_pair_attempts a where a.athlete_id = me and a.at > now() - interval '10 minutes') >= 10 then
    return 'too_many';
  end if;
  insert into private.device_pair_attempts (athlete_id) values (me);

  select * into pairing from public.device_pairings p where p.code = upper(replace(trim(p_code), ' ', ''));
  if not found then return 'invalid'; end if;
  if pairing.expires_at < now() then return 'expired'; end if;
  if pairing.athlete_id is not null then return 'used'; end if;

  update public.device_pairings set athlete_id = me, claimed_at = now() where code = pairing.code;
  delete from private.device_pair_attempts a where a.athlete_id = me and a.at < now() - interval '1 day';
  return pairing.kind;
end;
$$;
revoke all on function public.claim_device_code(text) from public, anon;
grant execute on function public.claim_device_code(text) to authenticated;

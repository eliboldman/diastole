-- First-run welcome tour: shown on Today until the athlete finishes or skips it.
alter table public.profiles add column welcomed_at timestamptz;

create or replace function public.mark_welcomed()
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles set welcomed_at = now() where id = auth.uid() and welcomed_at is null;
$$;
revoke all on function public.mark_welcomed() from public, anon;
grant execute on function public.mark_welcomed() to authenticated;

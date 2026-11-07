-- Per-person page layout: which sections show on Today and Me, and their order.
-- { today?: { order: text[], hidden: text[] }, me?: {...} }, cleaned by lib/layout-prefs.ts.
alter table public.profiles add column layout jsonb not null default '{}'::jsonb
  check (jsonb_typeof(layout) = 'object' and length(layout::text) < 4000);
grant update (layout) on public.profiles to authenticated;

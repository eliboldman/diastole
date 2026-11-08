-- Appearance: more color themes (three fixed hues and a custom one) plus background, glow, text
-- size, corners, spacing and motion. Saved on the account so it follows the person to new devices.
alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check
  check (theme in ('diastole', 'ocean', 'violet', 'mono', 'sunset', 'rose', 'gold', 'custom', 'blocks'));

alter table public.profiles add column appearance jsonb not null default '{}'
  check (jsonb_typeof(appearance) = 'object' and length(appearance::text) < 1000);
grant update (appearance) on public.profiles to authenticated;

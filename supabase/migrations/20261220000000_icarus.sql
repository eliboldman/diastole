-- Icarus: a hidden tribute theme (found by typing "icarus" into search).
alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check
  check (theme in ('diastole', 'ocean', 'violet', 'mono', 'sunset', 'rose', 'gold', 'custom', 'blocks', 'icarus'));

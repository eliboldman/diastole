-- Each person's bottom tab bar: {"athlete": ["me", "pods", ...], "coach": [...]}. Null = defaults.
alter table public.profiles add column tab_bar jsonb
  check (tab_bar is null or (jsonb_typeof(tab_bar) = 'object' and length(tab_bar::text) < 600));
grant update (tab_bar) on public.profiles to authenticated;

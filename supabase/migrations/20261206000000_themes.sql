-- Phase 13: personalization. Each person picks a color theme (one hidden). Saved on the account
-- so it follows them to the iPhone app.
alter table public.profiles add column theme text not null default 'diastole'
  check (theme in ('diastole', 'ocean', 'violet', 'mono', 'blocks'));
grant update (theme) on public.profiles to authenticated;

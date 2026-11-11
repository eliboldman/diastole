-- Garmin watch app, round two: the fueling data field pairs as its own device kind, and the
-- post-workout check-in (from the watch or the app) can say whether the fuel went in.

alter table public.device_pairings drop constraint device_pairings_kind_check;
alter table public.device_pairings add constraint device_pairings_kind_check check (kind in ('garmin_watch', 'garmin_field', 'apple_tv'));
alter table public.device_links drop constraint device_links_kind_check;
alter table public.device_links add constraint device_links_kind_check check (kind in ('garmin_watch', 'garmin_field', 'apple_tv'));

-- all = took the planned fuel, some = part of it, none = skipped it. Null when not asked.
alter table public.workout_checkins add column fuel text check (fuel is null or fuel in ('all', 'some', 'none'));

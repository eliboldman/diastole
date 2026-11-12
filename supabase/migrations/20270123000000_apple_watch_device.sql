-- The Apple Watch app signs in as its own device kind: the iPhone app hands it a token (no code to
-- type), or it shows a pairing code like the Apple TV when no iPhone is nearby.
alter table public.device_pairings drop constraint device_pairings_kind_check;
alter table public.device_pairings add constraint device_pairings_kind_check check (kind in ('garmin_watch', 'garmin_field', 'apple_tv', 'apple_watch'));
alter table public.device_links drop constraint device_links_kind_check;
alter table public.device_links add constraint device_links_kind_check check (kind in ('garmin_watch', 'garmin_field', 'apple_tv', 'apple_watch'));

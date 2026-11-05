-- Workouts uploaded as a file (FIT, or Garmin's "Export Original" ZIP) for activities Garmin's API
-- won't share, e.g. rides that Rouvy, Zwift or TrainerRoad pushed into Garmin Connect.
alter type public.data_source add value if not exists 'upload';

alter table public.activity_details drop constraint if exists activity_details_source_check;
alter table public.activity_details
  add constraint activity_details_source_check check (source in ('garmin_fit', 'garmin_export_fit', 'upload_fit', 'apple'));

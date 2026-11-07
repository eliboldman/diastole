-- Barcode scanning (iPhone app): a packaged food looked up by its barcode can be logged as a meal.
alter table public.meal_logs drop constraint meal_logs_source_check;
alter table public.meal_logs add constraint meal_logs_source_check check (source in ('photo', 'text', 'repeat', 'barcode'));

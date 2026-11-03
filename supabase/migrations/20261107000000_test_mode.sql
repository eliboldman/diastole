-- AI test mode: fake athletes the coach can seed with scenarios and run the morning analysis on.
-- Test athletes never have a device, are excluded from the roster, dashboard and the daily cron,
-- and the app refuses to send anything to a watch for them.

alter table public.profiles add column is_test boolean not null default false;
create index profiles_coach_test on public.profiles (coach_id, is_test);

alter table public.ai_usage drop constraint ai_usage_trigger_check;
alter table public.ai_usage add constraint ai_usage_trigger_check check (trigger in ('cron', 'manual', 'test'));

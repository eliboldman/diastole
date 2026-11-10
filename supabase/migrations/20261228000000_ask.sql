-- Ask Diastole: the coach's questions about their own data, logged like the other AI features.
alter table public.ai_usage drop constraint ai_usage_trigger_check;
alter table public.ai_usage add constraint ai_usage_trigger_check check (trigger in ('cron', 'manual', 'test', 'form', 'why', 'brief', 'build', 'meal', 'plan', 'swap', 'ask'));

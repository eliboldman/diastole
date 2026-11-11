-- A planned workout is done once an activity is linked to it, however that happened (Garmin, Apple
-- Watch, a file upload, a logged strength session). Cut short or off target still counts: the session
-- was done; how it went shows in the week review and the missed-session alerts. Unlinking (the
-- activity deleted or re-linked) puts the workout back to sent/approved if nothing else fulfils it.

create or replace function public.sync_workout_completed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.planned_workout_id is not null
     and (tg_op = 'DELETE' or old.planned_workout_id is distinct from new.planned_workout_id) then
    update planned_workouts pw
       set status = case when pw.sent_at is not null or pw.external_id is not null then 'sent' else 'approved' end::workout_status
     where pw.id = old.planned_workout_id
       and pw.status = 'completed'
       and not exists (select 1 from activities a where a.planned_workout_id = pw.id and a.id <> old.id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.planned_workout_id is not null then
    update planned_workouts set status = 'completed'
     where id = new.planned_workout_id and status in ('approved', 'sent');
  end if;
  return null;
end $$;

drop trigger if exists activities_workout_completed on public.activities;
create trigger activities_workout_completed
  after insert or update of planned_workout_id or delete on public.activities
  for each row execute function public.sync_workout_completed();

-- Everything already linked.
update public.planned_workouts pw set status = 'completed'
 where pw.status in ('approved', 'sent')
   and exists (select 1 from public.activities a where a.planned_workout_id = pw.id);

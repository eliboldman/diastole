-- Apple Watch through the iPhone app. The app reads Apple Health (workouts, HRV, resting heart
-- rate, sleep) and writes the athlete's own 'apple' rows (already allowed by row-level security),
-- and it puts coach-approved workouts in the Apple Watch Workout app (WorkoutKit). This function is
-- how the app reports back what it scheduled or removed, since athletes can't edit planned workouts.

create or replace function public.apple_ack_workouts(p_sent uuid[], p_removed uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  update public.planned_workouts
     set status = 'sent', sent_at = now(), external_id = 'apple:' || id
   where id = any(coalesce(p_sent, '{}')) and athlete_id = auth.uid() and deleted_at is null and status in ('approved', 'sent');
  update public.planned_workouts
     set removal_status = 'removed', removal_error = null
   where id = any(coalesce(p_removed, '{}')) and athlete_id = auth.uid() and deleted_at is not null and removal_status = 'pending_sync';
end;
$$;
revoke all on function public.apple_ack_workouts(uuid[], uuid[]) from public, anon;
grant execute on function public.apple_ack_workouts(uuid[], uuid[]) to authenticated;

-- Before 2026-11-06, approving an AI suggestion marked the session it replaced as 'skipped' (already
-- removed from Garmin) but left it on the schedule, so athletes saw two workouts that day.
-- Approvals now soft-delete the replaced session; this moves the old ones to "Recently removed" too.
update public.planned_workouts pw
set deleted_at = now(), removal_status = 'removed'
from public.ai_suggestions s
where s.target_workout_id = pw.id
  and s.status = 'approved'
  and s.action <> 'keep'
  and pw.status = 'skipped'
  and pw.deleted_at is null;

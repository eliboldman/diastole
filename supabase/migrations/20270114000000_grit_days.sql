-- Grit history shows the day something was earned. Check-ins paid before that was recorded get
-- the day of the check-in (in the athlete's time zone).
update public.grit_ledger g
set detail = coalesce(g.detail, '{}'::jsonb) || jsonb_build_object('day', to_char(c.created_at at time zone coalesce(p.timezone, 'America/Chicago'), 'YYYY-MM-DD'))
from public.workout_checkins c, public.profiles p
where g.kind = 'checkin' and c.activity_id::text = g.ref and p.id = g.athlete_id and (g.detail is null or not g.detail ? 'day');

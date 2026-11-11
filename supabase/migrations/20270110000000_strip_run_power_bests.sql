-- Best efforts stored before rides-only power (3b16834) can carry a 20-minute power from a run.
-- Running power reads far higher than bike power, and the FTP suggester read those values, so it
-- kept proposing FTPs from runs. Drop power_20m from every activity that isn't a ride (same rule
-- as lib/activity/bests.ts: bike words, and no run words).
update public.activity_details d
set bests = d.bests - 'power_20m'
from public.activities a
where a.id = d.activity_id
  and d.bests ? 'power_20m'
  and not (coalesce(a.sport, '') ~* '(cycl|bik|ride|spin)' and coalesce(a.sport, '') !~* '(run|treadmill|track|trail)');

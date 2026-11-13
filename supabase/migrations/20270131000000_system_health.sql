-- System health page for the app owner: are the scheduled jobs running, are pushes and Garmin
-- syncs working, are protein reminders going out. is_admin = the owner (the first coach account).

alter table public.profiles add column is_admin boolean not null default false;
update public.profiles set is_admin = true
 where id = (select id from public.profiles where role = 'coach' order by created_at limit 1);

-- Last run of each scheduled job (written by the job routes with the service key).
create table public.job_heartbeats (
  job            text primary key check (length(job) <= 40),
  last_run_at    timestamptz not null default now(),
  last_ok        boolean not null,
  last_detail    jsonb,
  last_error     text check (last_error is null or length(last_error) <= 500),
  last_error_at  timestamptz
);
alter table public.job_heartbeats enable row level security;

-- Failures worth seeing (APNs errors and the like). Kept 30 days by the page query's window.
create table public.system_events (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  kind    text not null check (length(kind) <= 40),
  detail  jsonb
);
create index system_events_at on public.system_events (at desc);
alter table public.system_events enable row level security;

create or replace function public.system_health()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  out jsonb := '{}'::jsonb;
  part jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then return null; end if;

  select coalesce(jsonb_agg(to_jsonb(h) order by h.job), '[]'::jsonb) into part from public.job_heartbeats h;
  out := out || jsonb_build_object('jobs', part);

  begin
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_start', (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
        'last_status', (select d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1),
        'ok_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours' and d.status = 'succeeded'),
        'failed_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours' and d.status = 'failed'))), '[]'::jsonb)
      from cron.job j $q$ into part;
  exception when others then part := jsonb_build_object('error', sqlerrm);
  end;
  out := out || jsonb_build_object('cron', part);

  begin
    execute $q$
      select jsonb_build_object(
        'total_24h', count(*),
        'failed_24h', count(*) filter (where r.status_code is null or r.status_code >= 400 or r.error_msg is not null),
        'last_error', (select coalesce(x.error_msg, x.status_code::text) from net._http_response x
                        where x.created > now() - interval '24 hours' and (x.status_code is null or x.status_code >= 400 or x.error_msg is not null)
                        order by x.created desc limit 1))
      from net._http_response r where r.created > now() - interval '24 hours' $q$ into part;
  exception when others then part := jsonb_build_object('error', sqlerrm);
  end;
  out := out || jsonb_build_object('pings', part);

  select jsonb_build_object(
    'last_at', max(created_at),
    'sent_24h', count(*) filter (where outcome = 'sent' and created_at > now() - interval '24 hours'),
    'ate_24h', count(*) filter (where outcome = 'ate' and created_at > now() - interval '24 hours'),
    'quiet_24h', count(*) filter (where outcome = 'quiet' and created_at > now() - interval '24 hours'),
    'sent_7d', count(*) filter (where outcome = 'sent' and created_at > now() - interval '7 days'),
    'ate_7d', count(*) filter (where outcome = 'ate' and created_at > now() - interval '7 days'),
    'quiet_7d', count(*) filter (where outcome = 'quiet' and created_at > now() - interval '7 days'))
  into part from public.refuel_nudges;
  out := out || jsonb_build_object('refuel', part);

  select jsonb_build_object(
    'created_24h', count(*),
    'pushed_24h', count(*) filter (where n.pushed_at is not null),
    'unpushed_with_device_24h', count(*) filter (where n.pushed_at is null and n.created_at < now() - interval '5 minutes'
                                                  and exists (select 1 from public.push_tokens t where t.user_id = n.user_id and t.platform = 'ios')),
    'devices', (select count(*) from public.push_tokens where platform = 'ios'),
    'apns_failures_24h', (select count(*) from public.system_events e where e.kind = 'apns_failure' and e.at > now() - interval '24 hours'),
    'last_apns_failure', (select e.detail from public.system_events e where e.kind = 'apns_failure' order by e.at desc limit 1))
  into part from public.notifications n where n.created_at > now() - interval '24 hours';
  out := out || jsonb_build_object('push', part);

  select jsonb_build_object(
    'last_at', max(received_at),
    'ok_24h', count(*) filter (where outcome = 'ok' and received_at > now() - interval '24 hours'),
    'errors_24h', count(*) filter (where outcome <> 'ok' and received_at > now() - interval '24 hours'),
    'last_error', (select left(coalesce(g.error, g.outcome), 200) from public.garmin_webhook_log g where g.outcome <> 'ok' order by g.received_at desc limit 1),
    'last_error_at', (select g.received_at from public.garmin_webhook_log g where g.outcome <> 'ok' order by g.received_at desc limit 1))
  into part from public.garmin_webhook_log where received_at > now() - interval '7 days';
  out := out || jsonb_build_object('garmin', part);

  select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(nullif(p.full_name, ''), p.email), 'source', d.source, 'last_synced_at', d.last_synced_at) order by d.last_synced_at nulls first), '[]'::jsonb)
  into part
  from public.device_connections d join public.profiles p on p.id = d.athlete_id
  where not p.is_test and not p.is_demo and (d.last_synced_at is null or d.last_synced_at < now() - interval '36 hours');
  out := out || jsonb_build_object('stale_devices', part);

  select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'detail', e.detail) order by e.at desc), '[]'::jsonb)
  into part from (select * from public.system_events where at > now() - interval '7 days' order by at desc limit 15) e;
  out := out || jsonb_build_object('events', part);
  return out;
end;
$$;
revoke all on function public.system_health() from public, anon;
grant execute on function public.system_health() to authenticated;

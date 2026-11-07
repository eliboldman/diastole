-- Athletes can read the form summaries their coach sees about them (Readiness page).
-- The table itself stays coach-only; this returns just the athlete-safe columns (no library picks,
-- usage or coach ids) and hides insights the coach dismissed. Last 60 days, newest first.

create or replace function public.my_form_insights()
returns table (id uuid, issue_key text, summary text, evidence text, drills text[], created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select f.id, f.issue_key, f.summary, f.evidence, f.drills, f.created_at
    from public.form_insights f
   where f.athlete_id = auth.uid()
     and f.status <> 'dismissed'
     and f.created_at >= now() - interval '60 days'
   order by f.created_at desc
   limit 20;
$$;
revoke all on function public.my_form_insights() from public, anon;
grant execute on function public.my_form_insights() to authenticated;

-- Self-coaching: the Sunday review proposes next week (hold / recover), and a run of red readiness days
-- proposes 2-3 lighter days instead of a one-day swap. Both are proposals the athlete approves.
alter table public.coach_proposals drop constraint coach_proposals_kind_check;
alter table public.coach_proposals add constraint coach_proposals_kind_check
  check (kind in ('readiness_swap', 'reschedule', 'goal_pace', 'deficit_up', 'week_call', 'lighter_days'));

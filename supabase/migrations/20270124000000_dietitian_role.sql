-- A team dietitian: invited by a coach, sees everything that coach sees about their athletes, and
-- sets each athlete's nutrition goals. Its own file because a new enum value can't be used in the
-- same transaction that adds it.
alter type public.user_role add value if not exists 'dietitian';

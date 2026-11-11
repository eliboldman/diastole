-- Goal times typed as "3:55" for long races were saved as 3 min 55 s instead of 3 h 55 min, so
-- fueling, packing and estimates treated a 70.3 as a 4-minute race. Nobody races 15 km or more in
-- under 24 minutes, so any such goal was meant as h:mm: scale it up.
update public.races
set goal_seconds = goal_seconds * 60
where goal_seconds is not null
  and goal_seconds < 1440
  and distance_km >= 15;

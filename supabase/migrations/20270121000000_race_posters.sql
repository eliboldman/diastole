-- Living race posters: finished posters the athlete keeps in their collection.
alter table public.races add column poster_kept boolean not null default false;

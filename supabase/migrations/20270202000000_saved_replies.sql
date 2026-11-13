-- Saved replies: short messages a person reuses in Messages ("easy day today", "great session").
-- Per person, at most 30, each up to 500 characters. Written through set_saved_replies.
alter table public.profiles add column saved_replies jsonb not null default '[]'::jsonb
  check (jsonb_typeof(saved_replies) = 'array' and jsonb_array_length(saved_replies) <= 30);

create or replace function public.set_saved_replies(p_list jsonb)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or jsonb_typeof(p_list) <> 'array' or jsonb_array_length(p_list) > 30 then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_list) e
             where jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 1 and 500) then return false; end if;
  update public.profiles set saved_replies = p_list where id = auth.uid();
  return true;
end;
$$;
revoke all on function public.set_saved_replies(jsonb) from public, anon;
grant execute on function public.set_saved_replies(jsonb) to authenticated;

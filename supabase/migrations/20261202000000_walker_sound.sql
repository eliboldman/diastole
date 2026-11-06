-- Eli's own recorded sound ("Walker"), selectable for any notification group.
create or replace function public.set_push_sound(p_group text, p_sound text)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return 'Sign in first.'; end if;
  if p_group not in ('coach', 'props', 'comments', 'messages', 'pods', 'workouts', 'coaching') then return 'Unknown group.'; end if;
  if p_sound not in ('quack', 'walker', 'heartbeat', 'chime', 'pop', 'tone', 'tick', 'default', 'none') then return 'Unknown sound.'; end if;
  update public.profiles set push_sounds = push_sounds || jsonb_build_object(p_group, p_sound) where id = auth.uid();
  return null;
end;
$$;

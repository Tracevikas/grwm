-- Lets a signed-in user delete their own account from the Profile page.
-- The app only has the public (anon) key, which can't touch auth.users, so this
-- function runs with the owner's rights but only ever deletes the caller.
-- Their outfits and pieces go too (foreign keys cascade on delete).
-- Run once in the Supabase SQL editor.

create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ⚠️  PURGE GRWM DATA: PERMANENT, CANNOT BE UNDONE.
--
-- Run in Supabase → SQL editor. Every option is commented out so running this
-- file by accident does nothing: uncomment exactly ONE option, then run it.
--
-- Photos, cut-outs and outfit looks live in Storage, which SQL can't delete.
-- Afterwards empty them in the dashboard: Storage → "outfits" bucket → ⋯ → Empty bucket
-- (or, for one user, delete the folder named after their user id).


-- ── Option 1: delete everyone's wardrobe data, keep the user accounts ──────
-- begin;
-- truncate table public.outfit_items, public.wardrobe_items, public.outfits restart identity cascade;
-- commit;


-- ── Option 2: delete everything, including every user account ──────────────
-- (Wardrobe rows reference auth.users with "on delete cascade", so they go too.)
-- begin;
-- truncate table public.outfit_items, public.wardrobe_items, public.outfits restart identity cascade;
-- delete from auth.users;
-- commit;


-- ── Option 3: delete one user's data, keep their account ───────────────────
-- Replace the email in both lines.
-- begin;
-- delete from public.outfits        where user_id = (select id from auth.users where email = 'you@example.com');
-- delete from public.wardrobe_items where user_id = (select id from auth.users where email = 'you@example.com');
-- commit;

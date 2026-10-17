-- ChatGPT "look" images: a background-free flat-lay of each logged outfit.
-- Run once in the Supabase SQL editor.

alter table public.outfits add column if not exists look_path text;
alter table public.outfits add column if not exists look_status text
  check (look_status in ('pending', 'done', 'failed'));

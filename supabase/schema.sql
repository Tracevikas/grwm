-- GRWM schema. Run once in the Supabase SQL editor (Dashboard → SQL → New query).

create extension if not exists "pgcrypto";

-- One row per photo the user logs ("what I wore today").
create table if not exists public.outfits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  worn_on     date not null default current_date,
  photo_path  text not null,
  photo_w     int  not null,
  photo_h     int  not null,
  notes       text,
  status      text not null default 'processing' check (status in ('processing', 'done', 'failed')),
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists outfits_user_worn_idx on public.outfits (user_id, worn_on desc);

-- The digital wardrobe: each distinct garment, deduplicated across photos.
create table if not exists public.wardrobe_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null,
  category         text not null check (category in ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'accessory', 'other')),
  subcategory      text,
  colors           text[] not null default '{}',
  pattern          text,
  material         text,
  style            text,
  seasons          text[] not null default '{}',
  description      text,
  -- Photo + normalized crop box used as the item's thumbnail.
  cover_outfit_id  uuid references public.outfits (id) on delete set null,
  cover_box        jsonb,
  -- Transparent PNG of just the garment, when segmentation found it.
  cutout_path      text,
  created_at       timestamptz not null default now()
);
alter table public.wardrobe_items add column if not exists cutout_path text;
create index if not exists wardrobe_items_user_idx on public.wardrobe_items (user_id, category);

-- Which items appear in which outfit, with where they are in that photo.
create table if not exists public.outfit_items (
  outfit_id  uuid not null references public.outfits (id) on delete cascade,
  item_id    uuid not null references public.wardrobe_items (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  box        jsonb,
  primary key (outfit_id, item_id)
);
create index if not exists outfit_items_item_idx on public.outfit_items (item_id);

-- Wear stats per item, derived instead of stored so they never drift.
drop view if exists public.wardrobe_items_with_stats;
create view public.wardrobe_items_with_stats
with (security_invoker = true) as
select
  i.*,
  count(oi.outfit_id)::int as times_worn,
  max(o.worn_on)           as last_worn
from public.wardrobe_items i
left join public.outfit_items oi on oi.item_id = i.id
left join public.outfits o on o.id = oi.outfit_id and o.status = 'done'
group by i.id;

-- Row level security: users only ever see their own rows.
alter table public.outfits        enable row level security;
alter table public.wardrobe_items enable row level security;
alter table public.outfit_items   enable row level security;

drop policy if exists "own outfits" on public.outfits;
create policy "own outfits" on public.outfits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own items" on public.wardrobe_items;
create policy "own items" on public.wardrobe_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own outfit items" on public.outfit_items;
create policy "own outfit items" on public.outfit_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Private photo bucket; each user writes under a folder named after their user id.
insert into storage.buckets (id, name, public)
values ('outfits', 'outfits', false)
on conflict (id) do nothing;

drop policy if exists "own outfit photos" on storage.objects;
create policy "own outfit photos" on storage.objects
  for all to authenticated
  using (bucket_id = 'outfits' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'outfits' and (storage.foldername(name))[1] = auth.uid()::text);

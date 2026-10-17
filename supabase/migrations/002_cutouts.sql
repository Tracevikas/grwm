-- Garment cut-outs: a transparent PNG per wardrobe item, stored in the outfits bucket.
-- Run once in the Supabase SQL editor if you created the database before cut-outs existed.

alter table public.wardrobe_items add column if not exists cutout_path text;

-- The stats view expands i.* when created, so recreate it to pick up the new column.
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

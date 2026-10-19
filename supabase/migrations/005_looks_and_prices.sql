-- Saved looks (from Today, Dress Me and the canvas), planned dates, and item prices.
-- Run once in the Supabase SQL editor.

-- What a piece cost, for cost per wear. Optional.
alter table public.wardrobe_items add column if not exists price numeric(10, 2) check (price >= 0);

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

-- A look is a set of pieces, optionally arranged on the canvas and planned for a day.
create table if not exists public.looks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default 'Untitled look',
  source      text not null default 'canvas' check (source in ('today', 'shuffle', 'canvas')),
  -- Ordered pieces: [{ item_id, x, y, scale, rotate }] with x/y as 0–1 of the board.
  layout      jsonb not null default '[]',
  -- Why the stylist picked it (Today) or the user's own note.
  note        text,
  planned_for date,
  created_at  timestamptz not null default now()
);
create index if not exists looks_user_idx on public.looks (user_id, created_at desc);
create index if not exists looks_planned_idx on public.looks (user_id, planned_for) where planned_for is not null;

alter table public.looks enable row level security;

drop policy if exists "own looks" on public.looks;
create policy "own looks" on public.looks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

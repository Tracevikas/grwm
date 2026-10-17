import { PageShell } from "@/components/PageShell";
import { PageSkeleton } from "@/components/PageSkeleton";
import { SORTS, WardrobeView, type SortKey } from "@/components/WardrobeView";
import { spectrum } from "@/lib/colors";
import { withCoverPhotos } from "@/lib/queries";
import { getUser } from "@/lib/supabase/server";
import { CATEGORIES, type Category, type WardrobeItem } from "@/lib/types";
import { signOut } from "../login/actions";

const ORDER: Record<SortKey, { column: string; ascending: boolean }> = {
  recent: { column: "last_worn", ascending: false },
  forgotten: { column: "last_worn", ascending: true },
  most: { column: "times_worn", ascending: false },
  new: { column: "created_at", ascending: false },
};

export default function WardrobePage(props: PageProps<"/">) {
  return (
    <PageShell fallback={<PageSkeleton />}>
      <Wardrobe {...props} />
    </PageShell>
  );
}

async function Wardrobe(props: PageProps<"/">) {
  const params = await props.searchParams;
  const category = CATEGORIES.includes(params.category as Category) ? (params.category as Category) : null;
  const sort: SortKey = (params.sort as SortKey) in SORTS ? (params.sort as SortKey) : "recent";
  const color = typeof params.color === "string" ? params.color.toLowerCase() : null;
  // Strip characters that have meaning inside a PostgREST `or` filter.
  const q = typeof params.q === "string" ? params.q.replace(/[,()%*\\]/g, " ").trim() : "";

  const { supabase } = await getUser();

  let query = supabase
    .from("wardrobe_items_with_stats")
    .select("*")
    .order(ORDER[sort].column, { ascending: ORDER[sort].ascending, nullsFirst: sort === "forgotten" });
  if (category) query = query.eq("category", category);
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%,subcategory.ilike.%${q}%`);

  const [{ data }, { data: all }] = await Promise.all([
    query,
    supabase.from("wardrobe_items").select("colors"),
  ]);

  // Colour filter matches an item's main colour, the same thing the spectrum shows.
  const rows = ((data ?? []) as WardrobeItem[]).filter(
    (i) => !color || i.colors[0]?.trim().toLowerCase() === color,
  );
  const items = await withCoverPhotos(supabase, rows);
  const everything = (all ?? []) as { colors: string[] }[];

  return (
    <WardrobeView
      total={everything.length}
      items={items}
      bands={spectrum(everything)}
      filters={{ category, color, sort, q }}
      signOut={signOut}
    />
  );
}

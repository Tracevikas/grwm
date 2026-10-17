import { PageShell } from "@/components/PageShell";
import { DiaryView } from "@/components/DiaryView";
import { PageSkeleton } from "@/components/PageSkeleton";
import { signPhotos } from "@/lib/photos";
import { getUser } from "@/lib/supabase/server";
import type { Outfit } from "@/lib/types";

type Row = Outfit & { outfit_items: { count: number }[] };

export default function OutfitsPage() {
  return (
    <PageShell fallback={<PageSkeleton />}>
      <Outfits />
    </PageShell>
  );
}

async function Outfits() {
  const { supabase } = await getUser();
  const { data } = await supabase
    .from("outfits")
    .select("*, outfit_items(count)")
    .order("worn_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(120);

  const rows = (data ?? []) as Row[];
  const urls = await signPhotos(supabase, rows.flatMap((o) => (o.look_path ? [o.photo_path, o.look_path] : [o.photo_path])));

  return (
    <DiaryView
      outfits={rows.map(({ outfit_items, ...o }) => ({
        ...o,
        pieces: outfit_items[0]?.count ?? 0,
        url: urls[o.photo_path],
        lookUrl: o.look_path ? urls[o.look_path] : undefined,
      }))}
    />
  );
}

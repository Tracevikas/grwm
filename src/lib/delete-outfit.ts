import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "./photos";

/**
 * Deletes an outfit and tidies the wardrobe after it: pieces that only ever
 * appeared in this outfit are removed (with their cut-outs), and pieces worn in
 * other outfits take their cover photo from one of those instead.
 */
export async function deleteOutfitAndOrphans(supabase: SupabaseClient, outfitId: string) {
  const { data: outfit } = await supabase.from("outfits").select("*").eq("id", outfitId).single();
  if (!outfit) return { removedPieces: 0 };

  const { data: links } = await supabase.from("outfit_items").select("item_id").eq("outfit_id", outfitId);
  const itemIds = [...new Set((links ?? []).map((l) => l.item_id as string))];

  // Cascades to outfit_items; items whose cover was this outfit get a null cover.
  await supabase.from("outfits").delete().eq("id", outfitId);

  const orphans: string[] = [];
  for (const itemId of itemIds) {
    const { data: elsewhere } = await supabase
      .from("outfit_items")
      .select("outfit_id, box")
      .eq("item_id", itemId)
      .limit(1);
    const other = elsewhere?.[0];
    if (!other) {
      orphans.push(itemId);
      continue;
    }
    await supabase
      .from("wardrobe_items")
      .update({ cover_outfit_id: other.outfit_id, cover_box: other.box })
      .eq("id", itemId)
      .is("cover_outfit_id", null);
  }

  const files = [outfit.photo_path, outfit.look_path].filter(Boolean) as string[];
  if (orphans.length > 0) {
    const { data: rows } = await supabase.from("wardrobe_items").select("*").in("id", orphans);
    for (const row of rows ?? []) if (row.cutout_path) files.push(row.cutout_path as string);
    await supabase.from("wardrobe_items").delete().in("id", orphans);
  }
  if (files.length > 0) await supabase.storage.from(PHOTO_BUCKET).remove(files);

  return { removedPieces: orphans.length };
}

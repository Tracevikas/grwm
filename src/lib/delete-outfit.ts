import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "./photos";

/** Of these pieces, the ones no outfit links to any more. */
export async function unlinkedPieces(supabase: SupabaseClient, itemIds: string[]) {
  const orphans: string[] = [];
  for (const itemId of itemIds) {
    const { data } = await supabase.from("outfit_items").select("outfit_id").eq("item_id", itemId).limit(1);
    if (!data?.length) orphans.push(itemId);
  }
  return orphans;
}

/** Deletes pieces and their stored images (cut-outs and product shots). */
export async function removePieces(supabase: SupabaseClient, itemIds: string[]) {
  if (itemIds.length === 0) return 0;
  const { data: rows } = await supabase.from("wardrobe_items").select("*").in("id", itemIds);
  const files = (rows ?? []).map((r) => r.cutout_path as string | null).filter(Boolean) as string[];
  await supabase.from("wardrobe_items").delete().in("id", itemIds);
  if (files.length > 0) await supabase.storage.from(PHOTO_BUCKET).remove(files);
  return itemIds.length;
}

/**
 * Deletes an outfit and tidies the wardrobe after it: pieces that only ever
 * appeared in this outfit are removed (with their images), and pieces worn in
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

  const removedPieces = await removePieces(supabase, orphans);
  const files = [outfit.photo_path, outfit.look_path].filter(Boolean) as string[];
  if (files.length > 0) await supabase.storage.from(PHOTO_BUCKET).remove(files);

  return { removedPieces };
}

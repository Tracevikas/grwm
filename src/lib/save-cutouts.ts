import type { SupabaseClient } from "@supabase/supabase-js";
import { cutGarment, labelsFor, segmentPhoto } from "./cutout";
import { PHOTO_BUCKET } from "./photos";
import type { Box, Category } from "./types";

export type CutoutTarget = {
  id: string;
  name: string;
  category: Category;
  subcategory?: string | null;
  box: Box;
  /** Existing cut-out to replace, if any. */
  previousPath?: string | null;
};

/**
 * Segments the photo once, then saves a transparent cut-out for each target
 * and records it on the item. Items the model can't find are skipped and keep
 * showing the crop. Returns how many cut-outs were saved.
 */
export async function saveCutouts(
  supabase: SupabaseClient,
  userId: string,
  photo: Buffer,
  targets: CutoutTarget[],
): Promise<number> {
  const cuttable = targets.filter((t) => labelsFor(t).length > 0);
  if (cuttable.length === 0) return 0;

  const seg = await segmentPhoto(photo);
  let saved = 0;

  for (const target of cuttable) {
    try {
      const image = await cutGarment(seg, labelsFor(target), target.box);
      if (!image) continue;

      // A fresh name per version, so signed URLs never serve a stale image.
      const path = `${userId}/cutouts/${target.id}-${crypto.randomUUID().slice(0, 8)}.webp`;
      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, image, { contentType: "image/webp" });
      if (uploadError) continue;

      const { error } = await supabase.from("wardrobe_items").update({ cutout_path: path }).eq("id", target.id);
      if (error) {
        await supabase.storage.from(PHOTO_BUCKET).remove([path]);
        continue;
      }
      if (target.previousPath) await supabase.storage.from(PHOTO_BUCKET).remove([target.previousPath]);
      saved++;
    } catch (err) {
      console.warn(`Cut-out failed for item ${target.id}:`, err);
    }
  }
  return saved;
}

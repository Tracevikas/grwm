import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeOutfitPhoto, normalizeBox, type KnownItem } from "./analyze";
import { PHOTO_BUCKET } from "./photos";
import { saveCutouts, type CutoutTarget } from "./save-cutouts";
import type { Category } from "./types";

export class OutfitError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

/**
 * Runs the vision model on an outfit photo, matches garments against the
 * user's wardrobe, creates new items for unseen ones and links them all to
 * the outfit. Records failure on the outfit row before rethrowing.
 */
export async function processOutfit(supabase: SupabaseClient, outfitId: string) {
  const { data: outfit } = await supabase.from("outfits").select("*").eq("id", outfitId).single();
  if (!outfit) throw new OutfitError("Outfit not found", 404);

  try {
    await supabase.from("outfits").update({ status: "processing", error: null }).eq("id", outfitId);

    const { data: file, error: downloadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .download(outfit.photo_path);
    if (downloadError || !file) throw new OutfitError("Could not read the uploaded photo");

    const { data: wardrobe } = await supabase
      .from("wardrobe_items")
      .select("id, name, category, colors, pattern, description");
    const known = (wardrobe ?? []) as KnownItem[];
    const knownIds = new Set(known.map((k) => k.id));

    const photo = Buffer.from(await file.arrayBuffer());
    const base64 = photo.toString("base64");
    const analysis = await analyzeOutfitPhoto({ base64, mimeType: file.type || "image/jpeg" }, known);

    if (!analysis.has_person_outfit || analysis.items.length === 0) {
      throw new OutfitError("No outfit found in this photo. Try a clearer, full-length shot.", 422);
    }

    // A re-scan replaces this outfit's previous links.
    await supabase.from("outfit_items").delete().eq("outfit_id", outfitId);

    const usedIds = new Set<string>();
    const links: { outfit_id: string; item_id: string; box: object }[] = [];
    const fresh: CutoutTarget[] = [];
    const matched: CutoutTarget[] = [];
    let created = 0;

    for (const item of analysis.items) {
      const box = normalizeBox(item.box);
      let itemId =
        item.existing_item_id && knownIds.has(item.existing_item_id) && !usedIds.has(item.existing_item_id)
          ? item.existing_item_id
          : null;

      if (!itemId) {
        const { data: inserted, error } = await supabase
          .from("wardrobe_items")
          .insert({
            name: item.name,
            category: item.category,
            subcategory: item.subcategory,
            colors: item.colors,
            pattern: item.pattern,
            material: item.material,
            style: item.style,
            seasons: item.seasons,
            description: item.description,
            cover_outfit_id: outfitId,
            cover_box: box,
          })
          .select("id")
          .single();
        if (error || !inserted) throw new OutfitError(`Could not save "${item.name}": ${error?.message}`);
        itemId = inserted.id as string;
        created++;
        fresh.push({ id: itemId, name: item.name, category: item.category, subcategory: item.subcategory, box });
      } else {
        const k = known.find((w) => w.id === itemId)!;
        matched.push({ id: itemId, name: k.name, category: k.category as Category, box });
      }

      usedIds.add(itemId);
      links.push({ outfit_id: outfitId, item_id: itemId, box });
    }

    const { error: linkError } = await supabase.from("outfit_items").insert(links);
    if (linkError) throw new OutfitError(`Could not save outfit items: ${linkError.message}`);

    await supabase.from("outfits").update({ status: "done", error: null }).eq("id", outfitId);

    // Cut-outs are a bonus: the outfit is already saved, and items without one show the crop.
    const cutouts = await cutOutPieces(supabase, outfit.user_id, photo, fresh, matched).catch((err) => {
      console.warn("Cut-outs failed:", err);
      return 0;
    });

    return { items: links.length, created, matched: links.length - created, cutouts };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    await supabase.from("outfits").update({ status: "failed", error: message }).eq("id", outfitId);
    throw err instanceof OutfitError ? err : new OutfitError(message);
  }
}

/** New items, plus recognised ones that don't have a cut-out yet. */
async function cutOutPieces(
  supabase: SupabaseClient,
  userId: string,
  photo: Buffer,
  fresh: CutoutTarget[],
  matched: CutoutTarget[],
) {
  if (fresh.length === 0 && matched.length === 0) return 0;

  // Also confirms the cutout_path column exists before running the model.
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("id")
    .is("cutout_path", null)
    .in("id", matched.length ? matched.map((m) => m.id) : [NO_ID]);
  if (error) {
    console.warn("Cut-outs skipped. Run supabase/migrations/002_cutouts.sql:", error.message);
    return 0;
  }
  const missing = new Set((data ?? []).map((r) => r.id as string));
  return saveCutouts(supabase, userId, photo, [...fresh, ...matched.filter((m) => missing.has(m.id))]);
}

const NO_ID = "00000000-0000-0000-0000-000000000000";

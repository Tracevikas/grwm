import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI, { toFile } from "openai";
import { PHOTO_BUCKET } from "./photos";

type Piece = { name: string; category: string; description?: string | null };

export function lookPrompt(pieces: Piece[]) {
  const n = pieces.length;
  const list = pieces.map((p, i) => `${i + 1}. ${p.name} (${p.category})${p.description ? `: ${p.description}` : ""}`).join("\n");
  return `Make a clean product flat-lay of the clothing in this photo, as a catalogue would show it.

Show EXACTLY these ${n} ${n === 1 ? "piece" : "pieces"} and nothing else:
${list}

Rules:
- Draw only the ${n} ${n === 1 ? "piece" : "pieces"} listed. Do not add any garment or accessory that is not listed: no trousers, skirts, shoes, belts, ties, bags, watches or pocket squares unless they are in the list above.
- The photo may be cropped (for example waist up). Never invent the parts of the outfit that are out of frame.
- Copy each piece exactly from the photo: same colour and shade, fabric texture, pattern, collar, lapels, buttons, pockets and anything attached to it (e.g. a pocket square stays in the blazer pocket, not as a separate item).
- Remove the person completely: no body, skin, face, hair or hands.
- Remove the background completely; nothing behind the clothes.
- Lay the pieces out neatly side by side, front-facing, evenly lit. No mannequin, no text, no props.`;
}

/**
 * Asks the OpenAI image model for a background-free flat-lay of exactly the
 * outfit's pieces, stores it next to the photo and records it on the outfit.
 * Returns the stored path, or null if it couldn't be made (never throws: the
 * outfit is already saved, and the photo still shows).
 */
export async function makeOutfitLook(supabase: SupabaseClient, outfitId: string): Promise<string | null> {
  const { data: outfit } = await supabase
    .from("outfits")
    .select("id, user_id, photo_path, outfit_items(wardrobe_items(name, category, description))")
    .eq("id", outfitId)
    .single();
  if (!outfit) return null;

  // Also confirms the look columns exist (supabase/migrations/003_outfit_looks.sql).
  const { error: markError } = await supabase.from("outfits").update({ look_status: "pending" }).eq("id", outfitId);
  if (markError) {
    console.warn("Outfit look skipped. Run supabase/migrations/003_outfit_looks.sql:", markError.message);
    return null;
  }

  try {
    const pieces = ((outfit.outfit_items ?? []) as unknown as { wardrobe_items: Piece | null }[])
      .map((l) => l.wardrobe_items)
      .filter((p): p is Piece => Boolean(p));
    if (pieces.length === 0) throw new Error("No pieces to draw");

    const { data: file, error: downloadError } = await supabase.storage.from(PHOTO_BUCKET).download(outfit.photo_path);
    if (downloadError || !file) throw new Error("Could not read the outfit photo");

    const result = await new OpenAI().images.edit({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare",
      image: await toFile(Buffer.from(await file.arrayBuffer()), "outfit.jpg", { type: file.type || "image/jpeg" }),
      prompt: lookPrompt(pieces),
      background: "transparent",
      output_format: "webp",
      // High quality keeps fabric, buttons and shades closer to the photo.
      quality: "high",
      size: "1024x1536",
    });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new Error("The image model returned no image");

    const path = `${outfit.user_id}/looks/${outfitId}-${crypto.randomUUID().slice(0, 8)}.webp`;
    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, Buffer.from(b64, "base64"), { contentType: "image/webp" });
    if (uploadError) throw new Error(`Could not save the look: ${uploadError.message}`);

    const { data: previous } = await supabase.from("outfits").select("look_path").eq("id", outfitId).single();
    await supabase.from("outfits").update({ look_path: path, look_status: "done" }).eq("id", outfitId);
    if (previous?.look_path && previous.look_path !== path) {
      await supabase.storage.from(PHOTO_BUCKET).remove([previous.look_path]);
    }
    return path;
  } catch (err) {
    console.warn(`Outfit look failed for ${outfitId}:`, err instanceof Error ? err.message : err);
    await supabase.from("outfits").update({ look_status: "failed" }).eq("id", outfitId);
    return null;
  }
}

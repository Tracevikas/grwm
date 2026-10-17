import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI, { toFile } from "openai";
import { PHOTO_BUCKET } from "./photos";

type Piece = { name: string; category: string };

export function lookPrompt(pieces: Piece[]) {
  const list = pieces.map((p) => `- ${p.name} (${p.category})`).join("\n");
  return `Create a clean fashion flat-lay of exactly the outfit this person is wearing, as if each piece were laid out for a catalogue.

Pieces to include:
${list}

Rules:
- Remove the person completely: no body, skin, face, hair or hands.
- Remove the background completely; nothing behind the clothes.
- Keep each piece true to the photo: same colours, pattern, fabric, logos, buttons and fit. Do not invent or restyle anything.
- Arrange them like an outfit, front-facing: top or dress at the top, bottoms below, shoes at the bottom, bag and accessories to the side.
- No mannequin, no text, no props.`;
}

/**
 * Asks the OpenAI image model for a background-free flat-lay of the outfit,
 * stores it next to the photo and records it on the outfit. Never throws:
 * the outfit is already saved, and failures just leave the photo showing.
 */
export async function makeOutfitLook(supabase: SupabaseClient, outfitId: string): Promise<boolean> {
  const { data: outfit } = await supabase
    .from("outfits")
    .select("id, user_id, photo_path, outfit_items(wardrobe_items(name, category))")
    .eq("id", outfitId)
    .single();
  if (!outfit) return false;

  // Also confirms the look columns exist (supabase/migrations/003_outfit_looks.sql).
  const { error: markError } = await supabase.from("outfits").update({ look_status: "pending" }).eq("id", outfitId);
  if (markError) {
    console.warn("Outfit look skipped. Run supabase/migrations/003_outfit_looks.sql:", markError.message);
    return false;
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
      quality: "medium",
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
    return true;
  } catch (err) {
    console.warn(`Outfit look failed for ${outfitId}:`, err instanceof Error ? err.message : err);
    await supabase.from("outfits").update({ look_status: "failed" }).eq("id", outfitId);
    return false;
  }
}

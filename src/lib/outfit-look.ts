import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { PHOTO_BUCKET } from "./photos";
import type { Category } from "./types";

type Piece = {
  id: string;
  name: string;
  category: Category;
  subcategory?: string | null;
  description?: string | null;
  cutout_path?: string | null;
};

/** Product shots made by the image model live here; segmentation cut-outs live in /cutouts/. */
export const isProductShot = (path: string | null | undefined) => Boolean(path?.includes("/products/"));

export function piecePrompt(piece: Pick<Piece, "name" | "category" | "description">) {
  return `Extract ONLY this one item from the photo and show it as a clean catalogue product photo:

${piece.name} (${piece.category})${piece.description ? `: ${piece.description}` : ""}

Rules:
- Show just this single item, complete and front-facing, laid flat or on an invisible mannequin. If an arm, another garment or the photo edge hides part of it, complete that same item naturally.
- Copy it exactly from the photo: the same colour and shade, fabric texture, pattern, collar, lapels, buttons, pockets and stitching. Anything attached to it stays on it (e.g. a pocket square stays in the blazer pocket).
- Nothing else at all: no other garments or accessories, no person, skin, face, hair or hands, no hanger, no background, no shadow, no text.`;
}

/** Pieces in the order a catalogue lays out a look. */
const ORDER: Category[] = ["outerwear", "top", "dress", "bottom", "shoes", "bag", "accessory", "other"];

/**
 * Lays the product shots out on one transparent canvas: one centred, or a
 * two-column grid. Every piece comes from its own shot, so nothing can appear
 * in the look that wasn't detected in the photo.
 */
export async function composeLook(images: Buffer[], width = 1024) {
  const n = images.length;
  const cols = n === 1 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const cellW = Math.floor(width / cols);
  // Portrait cells (garments are taller than wide); the canvas grows with the rows.
  const cellH = Math.round(cellW * 1.3);
  const height = rows * cellH;
  const pad = 0.05;

  const layers = await Promise.all(
    images.map(async (img, i) => {
      const fitted = await sharp(img)
        .resize({
          width: Math.floor(cellW * (1 - 2 * pad)),
          height: Math.floor(cellH * (1 - 2 * pad)),
          fit: "inside",
        })
        .png()
        .toBuffer({ resolveWithObject: true });
      const row = Math.floor(i / cols);
      // A lone piece on the last row sits in the middle.
      const inRow = row === rows - 1 ? n - row * cols : cols;
      const col = i % cols;
      const rowLeft = Math.floor((width - inRow * cellW) / 2);
      return {
        input: fitted.data,
        left: rowLeft + col * cellW + Math.floor((cellW - fitted.info.width) / 2),
        top: row * cellH + Math.floor((cellH - fitted.info.height) / 2),
      };
    }),
  );

  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .webp({ quality: 90, alphaQuality: 95 })
    .toBuffer();
}

/** Runs tasks with at most `limit` in flight (image APIs rate-limit bursts). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function download(supabase: SupabaseClient, path: string) {
  const { data } = await supabase.storage.from(PHOTO_BUCKET).download(path);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

/**
 * Gets a product shot for one piece: reuses its existing one, or asks the image
 * model to extract it from the photo and stores it as the piece's image.
 * Falls back to the segmentation cut-out if generation fails.
 */
async function productShot(
  supabase: SupabaseClient,
  openai: OpenAI,
  userId: string,
  photo: { data: Buffer; type: string },
  piece: Piece,
): Promise<Buffer | null> {
  if (isProductShot(piece.cutout_path)) {
    const existing = await download(supabase, piece.cutout_path!);
    if (existing) return existing;
  }

  try {
    const tall = piece.category === "bottom" || piece.category === "dress" || piece.category === "outerwear";
    const result = await openai.images.edit({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare",
      image: await toFile(photo.data, "outfit.jpg", { type: photo.type }),
      prompt: piecePrompt(piece),
      background: "transparent",
      output_format: "png",
      // High quality keeps fabric, buttons and shades closest to the photo.
      quality: "high",
      size: tall ? "1024x1536" : "1024x1024",
    });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image returned");

    // Trim the empty margin so every shot is framed tightly around the garment.
    const shot = await sharp(Buffer.from(b64, "base64")).trim({ threshold: 1 }).webp({ quality: 90, alphaQuality: 95 }).toBuffer();

    const path = `${userId}/products/${piece.id}-${crypto.randomUUID().slice(0, 8)}.webp`;
    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, shot, { contentType: "image/webp" });
    if (!uploadError) {
      const { error } = await supabase.from("wardrobe_items").update({ cutout_path: path }).eq("id", piece.id);
      if (error) await supabase.storage.from(PHOTO_BUCKET).remove([path]);
      else if (piece.cutout_path && piece.cutout_path !== path) await supabase.storage.from(PHOTO_BUCKET).remove([piece.cutout_path]);
    }
    return shot;
  } catch (err) {
    console.warn(`Product shot failed for ${piece.name}:`, err instanceof Error ? err.message : err);
    return piece.cutout_path ? download(supabase, piece.cutout_path) : null;
  }
}

/**
 * Makes a product shot of every piece in the outfit (one image-model call per
 * new piece, in parallel; pieces worn before reuse theirs), then lays them out
 * as the outfit's background-free "look". Returns the look's path, or null if
 * it couldn't be made (never throws: the outfit is already saved).
 */
export async function makeOutfitLook(supabase: SupabaseClient, outfitId: string): Promise<string | null> {
  const { data: outfit } = await supabase
    .from("outfits")
    .select("id, user_id, photo_path, outfit_items(wardrobe_items(*))")
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
      .filter((p): p is Piece => Boolean(p))
      .sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));
    if (pieces.length === 0) throw new Error("No pieces to draw");

    const { data: file, error: downloadError } = await supabase.storage.from(PHOTO_BUCKET).download(outfit.photo_path);
    if (downloadError || !file) throw new Error("Could not read the outfit photo");
    const photo = { data: Buffer.from(await file.arrayBuffer()), type: file.type || "image/jpeg" };

    const openai = new OpenAI({ maxRetries: 4 });
    const shots = (await mapLimit(pieces, 3, (p) => productShot(supabase, openai, outfit.user_id, photo, p))).filter(
      (s): s is Buffer => Boolean(s),
    );
    if (shots.length === 0) throw new Error("No piece could be drawn");

    const path = `${outfit.user_id}/looks/${outfitId}-${crypto.randomUUID().slice(0, 8)}.webp`;
    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, await composeLook(shots), { contentType: "image/webp" });
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

import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI, { toFile } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
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

const SMALL: Category[] = ["accessory", "shoes", "bag"];

export function piecePrompt(piece: Pick<Piece, "name" | "category" | "description">, others: string[] = [], strict = false) {
  const small = SMALL.includes(piece.category);
  return `Extract ONLY this one item from the photo and show it as a clean catalogue product photo:

${piece.name} (${piece.category})${piece.description ? `: ${piece.description}` : ""}
${others.length ? `\nThe photo also shows ${others.join(", ")}. Do NOT show any of those.\n` : ""}
Rules:
- Show just this single item, complete and front-facing${small ? ", large and centred so it fills the frame" : ", laid flat or on an invisible mannequin"}. If an arm, another garment or the photo edge hides part of it, complete that same item naturally.
- Copy it exactly from the photo: the same colour and shade, material, pattern, shape, buttons, pockets and stitching. Anything attached to it stays on it (e.g. a pocket square stays in the blazer pocket).
- Nothing else at all: no other garments or accessories, no person, skin, face, hair or hands, no hanger, no background, no shadow, no text.${
    strict ? `\n- IMPORTANT: a previous attempt showed the wrong item. The image must contain only the ${piece.name}.` : ""
  }`;
}

const Verdict = z.object({
  what_it_shows: z.string().describe("Briefly, what the image shows"),
  shows_requested_item: z.boolean().describe("The image clearly shows the requested item"),
  shows_other_items: z
    .boolean()
    .describe("The image also shows a SEPARATE garment or accessory, a person or body parts. Details attached to the item itself don't count"),
});

/** Cheap vision check that a product shot really is the requested piece, alone. */
export async function shotMatches(openai: OpenAI, shot: Buffer, piece: Pick<Piece, "name" | "category">) {
  const small = await sharp(shot).resize({ width: 512, height: 512, fit: "inside" }).png().toBuffer();
  const res = await openai.chat.completions.parse({
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Does this product image show a ${piece.name} (${piece.category}), and no other separate item? Things attached to it (a pocket square in its pocket, buttons, a lining, a strap or buckle) are part of it.`,
          },
          { type: "image_url", image_url: { url: `data:image/png;base64,${small.toString("base64")}`, detail: "low" } },
        ],
      },
    ],
    response_format: zodResponseFormat(Verdict, "shot_check"),
  });
  const v = res.choices[0]?.message?.parsed;
  return Boolean(v && v.shows_requested_item && !v.shows_other_items);
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

/** Asks the image model to extract one piece from the photo; returns a tightly trimmed shot. */
async function generateShot(openai: OpenAI, photo: { data: Buffer; type: string }, piece: Piece, others: string[], strict: boolean) {
  const tall = piece.category === "bottom" || piece.category === "dress" || piece.category === "outerwear";
  const result = await openai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare",
    image: await toFile(photo.data, "outfit.jpg", { type: photo.type }),
    prompt: piecePrompt(piece, others, strict),
    background: "transparent",
    output_format: "png",
    // High quality keeps fabric, buttons and shades closest to the photo.
    quality: "high",
    size: tall ? "1024x1536" : "1024x1024",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image returned");
  // Trim the empty margin so every shot is framed tightly around the garment.
  return sharp(Buffer.from(b64, "base64")).trim({ threshold: 1 }).webp({ quality: 90, alphaQuality: 95 }).toBuffer();
}

/**
 * Gets a verified product shot for one piece: reuses its existing one if it
 * still checks out, otherwise asks the image model (with one stricter retry)
 * and stores the result as the piece's image. A shot that shows the wrong
 * item is never saved; the piece keeps its segmentation cut-out instead.
 */
async function productShot(
  supabase: SupabaseClient,
  openai: OpenAI,
  userId: string,
  photo: { data: Buffer; type: string },
  piece: Piece,
  others: string[],
): Promise<Buffer | null> {
  const fallback = async () =>
    piece.cutout_path && !isProductShot(piece.cutout_path) ? download(supabase, piece.cutout_path) : null;

  try {
    if (isProductShot(piece.cutout_path)) {
      const existing = await download(supabase, piece.cutout_path!);
      if (existing && (await shotMatches(openai, existing, piece))) return existing;
    }

    let shot: Buffer | null = null;
    for (const strict of [false, true]) {
      const attempt = await generateShot(openai, photo, piece, others, strict);
      if (await shotMatches(openai, attempt, piece)) {
        shot = attempt;
        break;
      }
      console.warn(`Product shot for ${piece.name} showed the wrong item${strict ? " again" : ", retrying"}`);
    }
    if (!shot) {
      // An earlier product shot that no longer checks out must not keep showing.
      if (isProductShot(piece.cutout_path)) {
        await supabase.from("wardrobe_items").update({ cutout_path: null }).eq("id", piece.id);
        await supabase.storage.from(PHOTO_BUCKET).remove([piece.cutout_path!]);
      }
      return fallback();
    }

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
    return fallback();
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
    const others = (p: Piece) => pieces.filter((o) => o !== p).map((o) => `a ${o.name}`);
    const shots = (await mapLimit(pieces, 3, (p) => productShot(supabase, openai, outfit.user_id, photo, p, others(p)))).filter(
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

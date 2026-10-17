import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI, { toFile } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import { flatLayShots } from "./flat-lay";
import { IMAGE_CONFIG } from "./image-config";
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

/**
 * True when the image really has a see-through background: an alpha channel,
 * transparent corners, and a meaningful share of transparent pixels. Catches
 * shots where the model painted a white or grey backdrop despite the setting.
 */
export async function hasRealTransparency(image: Buffer) {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const alpha = (x: number, y: number) => data[(y * w + x) * channels + 3];
  const clearCorners = [alpha(0, 0), alpha(w - 1, 0), alpha(0, h - 1), alpha(w - 1, h - 1)].filter((a) => a < 16).length;

  let clear = 0;
  for (let i = 3; i < data.length; i += channels) if (data[i] < 16) clear++;
  return clearCorners >= 3 && clear / (w * h) >= 0.05;
}

/** Asks the image model to extract one piece from the photo. */
async function generateShot(openai: OpenAI, photo: { data: Buffer; type: string }, piece: Piece, others: string[], strict: boolean) {
  const result = await openai.images.edit({
    model: IMAGE_CONFIG.image_model,
    image: await toFile(photo.data, "outfit.jpg", { type: photo.type }),
    prompt: piecePrompt(piece, others, strict),
    background: IMAGE_CONFIG.background,
    output_format: IMAGE_CONFIG.output_format,
    // High quality keeps fabric, buttons and shades closest to the photo.
    quality: IMAGE_CONFIG.quality,
    size: IMAGE_CONFIG.size,
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image returned");
  return Buffer.from(b64, "base64");
}

/** Trims the empty margin so every shot is framed tightly around the garment. */
const finishShot = (raw: Buffer) => sharp(raw).trim({ threshold: 1 }).webp({ quality: 90, alphaQuality: 95 }).toBuffer();

/** The piece's existing product shot, if it still checks out. */
async function checkedExistingShot(supabase: SupabaseClient, openai: OpenAI, piece: Piece) {
  if (!isProductShot(piece.cutout_path)) return null;
  try {
    const existing = await download(supabase, piece.cutout_path!);
    return existing && (await shotMatches(openai, existing, piece)) ? existing : null;
  } catch {
    return null;
  }
}

/**
 * Asks the image model for this one piece (up to max_retries more times,
 * stricter after a wrong item). Shots that show the wrong item or have no real
 * transparency are rejected. Returns null if no attempt passed.
 */
async function generatePieceShot(openai: OpenAI, photo: { data: Buffer; type: string }, piece: Piece, others: string[]) {
  let wrongItemSeen = false;
  for (let attempt = 0; attempt <= IMAGE_CONFIG.max_retries; attempt++) {
    try {
      const raw = await generateShot(openai, photo, piece, others, wrongItemSeen);
      if (IMAGE_CONFIG.verify_alpha_channel && !(await hasRealTransparency(raw))) {
        console.warn(`Product shot for ${piece.name}: background isn't transparent (attempt ${attempt + 1})`);
        continue;
      }
      const finished = await finishShot(raw);
      if (await shotMatches(openai, finished, piece)) return finished;
      wrongItemSeen = true;
      console.warn(`Product shot for ${piece.name}: showed the wrong item (attempt ${attempt + 1})`);
    } catch (err) {
      console.warn(`Product shot for ${piece.name} failed (attempt ${attempt + 1}):`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

/** Stores a new product shot as the piece's image, replacing its old one. */
async function saveShot(supabase: SupabaseClient, userId: string, piece: Piece, shot: Buffer) {
  const path = `${userId}/products/${piece.id}-${crypto.randomUUID().slice(0, 8)}.webp`;
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, shot, { contentType: "image/webp" });
  if (uploadError) return;
  const { error } = await supabase.from("wardrobe_items").update({ cutout_path: path }).eq("id", piece.id);
  if (error) await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  else if (piece.cutout_path && piece.cutout_path !== path) await supabase.storage.from(PHOTO_BUCKET).remove([piece.cutout_path]);
}

/**
 * No good shot came out: an earlier product shot that no longer checks out
 * must not keep showing, and the piece falls back to its segmentation cut-out.
 */
async function fallbackShot(supabase: SupabaseClient, piece: Piece) {
  if (isProductShot(piece.cutout_path)) {
    await supabase.from("wardrobe_items").update({ cutout_path: null }).eq("id", piece.id);
    await supabase.storage.from(PHOTO_BUCKET).remove([piece.cutout_path!]);
    return null;
  }
  return piece.cutout_path ? download(supabase, piece.cutout_path) : null;
}

/**
 * A verified product shot for every piece, as cheaply as possible:
 *  1. reuse each piece's existing shot if it still checks out;
 *  2. draw the rest in ONE flat-lay and cut it into pieces (one image call);
 *  3. pieces the flat-lay didn't cover cleanly get their own request.
 * New shots are saved as the pieces' images. Missing entries are null.
 */
async function productShots(
  supabase: SupabaseClient,
  openai: OpenAI,
  userId: string,
  photo: { data: Buffer; type: string },
  pieces: Piece[],
): Promise<(Buffer | null)[]> {
  const shots: (Buffer | null)[] = await mapLimit(pieces, 3, (p) => checkedExistingShot(supabase, openai, p));
  const fresh = new Set<number>();

  const needed = pieces.map((_, i) => i).filter((i) => !shots[i]);
  // A flat-lay only saves calls when there are at least two pieces to draw.
  if (needed.length >= 2) {
    const fromFlatLay = await flatLayShots(openai, photo, needed.map((i) => pieces[i]), hasRealTransparency);
    for (const [k, shot] of fromFlatLay) {
      shots[needed[k]] = shot;
      fresh.add(needed[k]);
    }
  }

  const others = (p: Piece) => pieces.filter((o) => o !== p).map((o) => `a ${o.name}`);
  const remaining = needed.filter((i) => !shots[i]);
  const individual = await mapLimit(remaining, 3, (i) => generatePieceShot(openai, photo, pieces[i], others(pieces[i])));
  remaining.forEach((i, k) => {
    if (individual[k]) {
      shots[i] = individual[k];
      fresh.add(i);
    }
  });

  await mapLimit(pieces.map((_, i) => i), 3, async (i) => {
    if (fresh.has(i)) await saveShot(supabase, userId, pieces[i], shots[i]!);
    else if (!shots[i]) shots[i] = await fallbackShot(supabase, pieces[i]);
  });
  return shots;
}

/**
 * Makes a product shot of every piece in the outfit (see productShots: reused,
 * cut from one flat-lay, or drawn one by one), then lays them out as the
 * outfit's background-free "look". Returns the look's path, or null if it
 * couldn't be made (never throws: the outfit is already saved).
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
    const shots = (await productShots(supabase, openai, outfit.user_id, photo, pieces)).filter((s): s is Buffer => Boolean(s));
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

import OpenAI, { toFile } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import { connectedRegions } from "./cutout";
import { IMAGE_CONFIG } from "./image-config";

export type FlatLayPiece = { name: string; category: string; description?: string | null };

export function flatLayPrompt(pieces: FlatLayPiece[]) {
  const n = pieces.length;
  const list = pieces.map((p, i) => `${i + 1}. ${p.name} (${p.category})${p.description ? `: ${p.description}` : ""}`).join("\n");
  return `Make ONE clean catalogue flat-lay showing EXACTLY these ${n} pieces from the photo, each copied exactly:

${list}

Layout rules:
- Each listed piece appears exactly once, complete and front-facing, laid flat. If something hides part of a piece in the photo, complete that same piece naturally.
- Leave a wide empty gap between pieces: no two pieces may touch or overlap.
- A pair (shoes, earrings, gloves) is ONE piece: place the two side by side, close together.
- Do not add anything that is not listed: no other garments or accessories, no props, no text.
- Copy each piece exactly from the photo: same colour and shade, fabric, pattern, buttons, collar, pockets and stitching. Details attached to a piece stay on it (e.g. a pocket square stays in the blazer pocket).
- No person, skin, face, hair or hands. No background, no shadows.`;
}

/** Asks the image model for one flat-lay of all the pieces. Returns the raw PNG. */
export async function generateFlatLay(openai: OpenAI, photo: { data: Buffer; type: string }, pieces: FlatLayPiece[]) {
  const result = await openai.images.edit({
    model: IMAGE_CONFIG.image_model,
    image: await toFile(photo.data, "outfit.jpg", { type: photo.type }),
    prompt: flatLayPrompt(pieces),
    background: IMAGE_CONFIG.background,
    output_format: IMAGE_CONFIG.output_format,
    quality: IMAGE_CONFIG.quality,
    size: IMAGE_CONFIG.size,
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image returned");
  return Buffer.from(b64, "base64");
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Merge distances tried, widest first, as shares of the image's longer side. */
const GAPS = [0.025, 0.012, 0.004];

/**
 * Cuts a transparent flat-lay into one image per piece. Separate shapes are
 * found from the alpha channel; shapes closer than a gap (the two shoes of a
 * pair, a loose button) are merged into one piece; specks are dropped. With
 * `expected`, the widest gap that yields exactly that many pieces wins, so
 * garments laid out too close together still come apart. Each crop keeps
 * only its own pixels, so a neighbour can never bleed in.
 */
export async function splitFlatLay(image: Buffer, expected?: number): Promise<Buffer[]> {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;

  const on = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (data[i * channels + 3] > 24) on[i] = 1;
  const { region, sizes } = connectedRegions(on, W, H);

  // Bounds of every shape big enough to matter.
  const minSize = W * H * 0.0008;
  const bounds = new Map<number, Bounds>();
  for (let i = 0; i < region.length; i++) {
    const id = region[i];
    if (!id || sizes[id] < minSize) continue;
    const x = i % W;
    const y = (i - x) / W;
    const b = bounds.get(id);
    if (!b) bounds.set(id, { minX: x, minY: y, maxX: x, maxY: y });
    else {
      if (x < b.minX) b.minX = x;
      if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y;
      if (y > b.maxY) b.maxY = y;
    }
  }

  // Merge shapes that come within `gap` of each other. Measured between the
  // shapes themselves (not their boxes), so a piece inside a long sleeve's box
  // stays separate: grow every shape by the gap on a coarse grid and see which
  // grown shapes touch.
  const ids = [...bounds.keys()];
  const scale = 4;
  const gw = Math.ceil(W / scale);
  const gh = Math.ceil(H / scale);
  // Every shape that touches each coarse cell.
  const cells = new Map<number, Set<number>>();
  for (let i = 0; i < region.length; i++) {
    const id = region[i];
    if (!bounds.has(id)) continue;
    const x = i % W;
    const cell = Math.floor((i - x) / W / scale) * gw + Math.floor(x / scale);
    const set = cells.get(cell);
    if (set) set.add(id);
    else cells.set(cell, new Set([id]));
  }

  /** Shapes grouped into pieces, merging those within `reach` coarse cells. */
  const groupsFor = (reach: number) => {
    const parent = new Map(ids.map((id) => [id, id]));
    const root = (id: number): number => (parent.get(id) === id ? id : root(parent.get(id)!));
    const join = (a: number, b: number) => {
      const ra = root(a);
      const rb = root(b);
      if (ra !== rb) parent.set(ra, rb);
    };
    for (const [cell, shapes] of cells) {
      const [first, ...rest] = shapes;
      for (const s of rest) join(first, s);
      const cx = cell % gw;
      const cy = (cell - cx) / gw;
      for (let dy = 0; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          if ((dy === 0 && dx <= 0) || dx * dx + dy * dy > reach * reach) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= gw || ny >= gh) continue;
          const near = cells.get(ny * gw + nx);
          if (near) for (const s of near) join(first, s);
        }
      }
    }
    const groups = new Map<number, number[]>();
    for (const id of ids) groups.set(root(id), [...(groups.get(root(id)) ?? []), id]);
    return [...groups.values()];
  };

  const options = GAPS.map((g) => groupsFor(Math.max(0, Math.round((Math.max(W, H) * g) / scale))));
  const chosen = (expected && options.find((o) => o.length === expected)) || options[0];

  const crops: Buffer[] = [];
  for (const members of chosen) {
    const keep = new Set(members);
    const box = members.map((m) => bounds.get(m)!).reduce((a, b) => ({
      minX: Math.min(a.minX, b.minX),
      minY: Math.min(a.minY, b.minY),
      maxX: Math.max(a.maxX, b.maxX),
      maxY: Math.max(a.maxY, b.maxY),
    }));
    const w = box.maxX - box.minX + 1;
    const h = box.maxY - box.minY + 1;
    const rgba = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const src = (box.minY + y) * W + (box.minX + x);
        if (!keep.has(region[src])) continue;
        const dst = (y * w + x) * 4;
        for (let c = 0; c < 4; c++) rgba[dst + c] = data[src * channels + c];
      }
    }
    crops.push(await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 90, alphaQuality: 95 }).toBuffer());
  }
  return crops;
}

const Assignment = z.object({
  crops: z.array(
    z.object({
      crop: z.number().describe("Crop number as labelled"),
      what_it_shows: z.string(),
      piece: z.number().nullable().describe("Number of the listed piece this crop shows, or null if none or more than one"),
    }),
  ),
});

/**
 * Asks a vision model which listed piece each crop shows. Returns piece index
 * → crop index, keeping only one-to-one answers (a crop claimed twice, or a
 * piece matched by two crops, is dropped and falls back to its own request).
 */
export async function assignCrops(openai: OpenAI, crops: Buffer[], pieces: FlatLayPiece[]): Promise<Map<number, number>> {
  const thumbs = await Promise.all(crops.map((c) => sharp(c).resize({ width: 384, height: 384, fit: "inside" }).png().toBuffer()));
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `These crops were cut from a flat-lay of clothes. Pieces:\n${pieces
        .map((p, i) => `${i + 1}. ${p.name} (${p.category})`)
        .join("\n")}\n\nFor each crop, say which piece number it shows. Use null if it shows none of them, or more than one separate item. Details attached to an item (a pocket square in its pocket, buttons) are part of it; a pair of shoes is one item.`,
    },
  ];
  thumbs.forEach((t, i) => {
    content.push({ type: "text", text: `Crop ${i + 1}:` });
    content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${t.toString("base64")}`, detail: "low" } });
  });

  const res = await openai.chat.completions.parse({
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    messages: [{ role: "user", content }],
    response_format: zodResponseFormat(Assignment, "crop_assignment"),
  });
  const answers = res.choices[0]?.message?.parsed?.crops ?? [];

  const byPiece = new Map<number, number[]>();
  const seenCrops = new Map<number, number>();
  for (const a of answers) {
    const crop = a.crop - 1;
    const piece = a.piece === null ? null : a.piece - 1;
    if (piece === null || crop < 0 || crop >= crops.length || piece < 0 || piece >= pieces.length) continue;
    seenCrops.set(crop, (seenCrops.get(crop) ?? 0) + 1);
    byPiece.set(piece, [...(byPiece.get(piece) ?? []), crop]);
  }
  const result = new Map<number, number>();
  for (const [piece, cs] of byPiece) {
    if (cs.length === 1 && seenCrops.get(cs[0]) === 1) result.set(piece, cs[0]);
  }
  return result;
}

/**
 * One image-model call for all the pieces, cut into per-piece shots.
 * Returns piece index → shot for every piece that came out cleanly; the
 * caller handles the rest piece by piece. Never throws.
 */
export async function flatLayShots(
  openai: OpenAI,
  photo: { data: Buffer; type: string },
  pieces: FlatLayPiece[],
  hasRealTransparency: (image: Buffer) => Promise<boolean>,
): Promise<Map<number, Buffer>> {
  try {
    const raw = await generateFlatLay(openai, photo, pieces);
    if (IMAGE_CONFIG.verify_alpha_channel && !(await hasRealTransparency(raw))) {
      console.warn("Flat-lay: background isn't transparent");
      return new Map();
    }
    const crops = await splitFlatLay(raw, pieces.length);
    if (crops.length !== pieces.length) {
      console.warn(`Flat-lay: expected ${pieces.length} pieces, cut ${crops.length}; matching what's there`);
    }
    const assigned = await assignCrops(openai, crops, pieces);
    return new Map([...assigned].map(([piece, crop]) => [piece, crops[crop]]));
  } catch (err) {
    console.warn("Flat-lay failed:", err instanceof Error ? err.message : err);
    return new Map();
  }
}

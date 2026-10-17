import type { ImageSegmentationPipeline } from "@huggingface/transformers";
import sharp from "sharp";
import type { Box, Category } from "./types";

/** Labels of the segformer_b2_clothes model that are garments (not skin, hair or background). */
export type GarmentLabel =
  | "Hat"
  | "Sunglasses"
  | "Upper-clothes"
  | "Skirt"
  | "Pants"
  | "Dress"
  | "Belt"
  | "Left-shoe"
  | "Right-shoe"
  | "Bag"
  | "Scarf";

const ACCESSORY_LABELS: [RegExp, GarmentLabel][] = [
  [/hat|cap|beanie|beret/i, "Hat"],
  [/sunglass|glasses|shades|spectacle/i, "Sunglasses"],
  [/belt/i, "Belt"],
  [/scarf|dupatta|stole|shawl|muffler|bandana/i, "Scarf"],
  [/bag|purse|clutch|tote|backpack/i, "Bag"],
];

/**
 * Which model labels make up an item, as ordered alternatives: the first set
 * with enough pixels inside the item's box wins. Empty means "can't cut out".
 */
export function labelsFor(item: { category: Category; subcategory?: string | null; name: string }): GarmentLabel[][] {
  switch (item.category) {
    case "top":
    case "outerwear":
      return [["Upper-clothes"], ["Dress"]];
    case "bottom":
      return [["Pants", "Skirt"], ["Dress"]];
    case "dress":
      return [["Dress"], ["Upper-clothes", "Skirt", "Pants"]];
    case "shoes":
      return [["Left-shoe", "Right-shoe"]];
    case "bag":
      return [["Bag"]];
    case "accessory": {
      const text = `${item.subcategory ?? ""} ${item.name}`;
      const match = ACCESSORY_LABELS.find(([re]) => re.test(text));
      return match ? [[match[1]]] : [];
    }
    default:
      return [];
  }
}

export type Segmentation = {
  width: number;
  height: number;
  /** Upright RGB pixels of the photo. */
  rgb: Buffer;
  /** One byte per pixel per label; > 127 means the pixel belongs to that label. */
  masks: Map<string, Uint8Array>;
};

let segmenter: Promise<ImageSegmentationPipeline> | null = null;

/** Loads the model once per server process (downloaded on first use, then cached on disk). */
function getSegmenter() {
  segmenter ??= import("@huggingface/transformers").then(
    ({ pipeline }) =>
      pipeline("image-segmentation", "Xenova/segformer_b2_clothes", { dtype: "q8" }) as Promise<ImageSegmentationPipeline>,
  );
  return segmenter;
}

export async function segmentPhoto(photo: Buffer): Promise<Segmentation> {
  const { data, info } = await sharp(photo).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { RawImage } = await import("@huggingface/transformers");
  const seg = await getSegmenter();
  const result = await seg(new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3));

  const masks = new Map<string, Uint8Array>();
  for (const { label, mask } of result) if (label) masks.set(label, mask.data as Uint8Array);
  return { width: info.width, height: info.height, rgb: data, masks };
}

/** Min share of the (padded) box the garment must cover to count as found. */
const MIN_COVERAGE = 0.04;
/** Min garment size, and the size below which a stray region is noise, as shares of the photo. */
const MIN_GARMENT = 0.0002;
const MIN_REGION = 0.0001;
const MAX_SIDE = 900;

/**
 * Labels connected regions of `on` pixels (4-neighbour). Returns a region id
 * per pixel (0 = off) and each region's size.
 */
export function connectedRegions(on: Uint8Array, W: number, H: number) {
  const region = new Int32Array(W * H);
  const sizes = [0];
  const stack = new Int32Array(W * H);
  for (let start = 0; start < on.length; start++) {
    if (!on[start] || region[start]) continue;
    const id = sizes.length;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    region[start] = id;
    while (top > 0) {
      const i = stack[--top];
      size++;
      const x = i % W;
      const next = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
      for (const n of next) {
        if (n >= 0 && n < on.length && on[n] && !region[n]) {
          region[n] = id;
          stack[top++] = n;
        }
      }
    }
    sizes.push(size);
  }
  return { region, sizes };
}

/**
 * Cuts one garment out of a segmented photo and returns a transparent WebP, or
 * null when the model didn't find enough of it. The box only picks which
 * regions belong to this item; regions are kept whole, so a tight box from the
 * vision model doesn't slice the garment.
 */
export async function cutGarment(seg: Segmentation, alternatives: GarmentLabel[][], box: Box): Promise<Buffer | null> {
  const { width: W, height: H } = seg;
  const pad = 0.04;
  const x0 = Math.max(0, Math.floor((box.x - pad) * W));
  const y0 = Math.max(0, Math.floor((box.y - pad) * H));
  const x1 = Math.min(W, Math.ceil((box.x + box.w + pad) * W));
  const y1 = Math.min(H, Math.ceil((box.y + box.h + pad) * H));
  const area = (x1 - x0) * (y1 - y0);
  if (area <= 0) return null;

  for (const labels of alternatives) {
    const layers = labels.map((l) => seg.masks.get(l)).filter((m): m is Uint8Array => Boolean(m));
    if (layers.length === 0) continue;

    const on = new Uint8Array(W * H);
    for (let i = 0; i < on.length; i++) if (layers.some((m) => m[i] > 127)) on[i] = 1;
    const { region, sizes } = connectedRegions(on, W, H);

    // How much of each region lies inside the box.
    const inside = new Map<number, number>();
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const id = region[y * W + x];
        if (id) inside.set(id, (inside.get(id) ?? 0) + 1);
      }
    }
    const insideTotal = [...inside.values()].reduce((a, b) => a + b, 0);
    if (insideTotal < Math.max(W * H * MIN_GARMENT, area * MIN_COVERAGE)) continue;

    // Keep regions that meaningfully overlap the box; drop specks.
    const keep = new Set(
      [...inside].filter(([id, n]) => n >= insideTotal * 0.02 && sizes[id] >= W * H * MIN_REGION).map(([id]) => id),
    );
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let i = 0; i < region.length; i++) {
      if (!keep.has(region[i])) continue;
      const x = i % W;
      const y = (i - x) / W;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxX < 0) continue;

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const rgba = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const src = (minY + y) * W + (minX + x);
        const dst = (y * w + x) * 4;
        rgba[dst] = seg.rgb[src * 3];
        rgba[dst + 1] = seg.rgb[src * 3 + 1];
        rgba[dst + 2] = seg.rgb[src * 3 + 2];
        rgba[dst + 3] = keep.has(region[src]) ? 255 : 0;
      }
    }

    // Soften the stair-stepped mask edge, then shrink to a sensible size.
    const alpha = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .extractChannel(3)
      .blur(1.2)
      .raw()
      .toBuffer();
    for (let i = 0; i < w * h; i++) rgba[i * 4 + 3] = alpha[i];

    return sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      // WebP keeps transparency at a fraction of PNG's size for photo pixels.
      .webp({ quality: 82, alphaQuality: 90 })
      .toBuffer();
  }
  return null;
}

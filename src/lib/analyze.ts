import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { CATEGORIES, type Box } from "./types";

const DetectedItem = z.object({
  visible_evidence: z
    .string()
    .describe("Where exactly in this photo the garment is and what of it you can see, e.g. 'navy shirt, upper body, fully visible'"),
  confidence: z.number().describe("0-1: how sure you are this garment is actually visible and worn/carried in this photo"),
  existing_item_id: z
    .string()
    .nullable()
    .describe("id of the matching item from the user's wardrobe list, or null if this garment is new"),
  match_confidence: z
    .number()
    .describe("0-1: how sure you are it is the SAME physical item as existing_item_id (0 when existing_item_id is null)"),
  name: z.string().describe("Short human name, e.g. 'Light-wash straight jeans'"),
  category: z.enum(CATEGORIES),
  subcategory: z.string().nullable().describe("e.g. t-shirt, kurta, sneakers, blazer"),
  colors: z.array(z.string()).describe("Dominant colors first, plain names like 'navy', 'off-white'"),
  pattern: z.string().nullable().describe("solid, striped, checked, floral, printed, ..."),
  material: z.string().nullable().describe("Best guess: denim, cotton, linen, leather, knit, ..."),
  style: z.string().nullable().describe("casual, formal, ethnic, sporty, party, ..."),
  seasons: z.array(z.enum(["summer", "monsoon", "autumn", "winter", "spring", "all"])),
  description: z.string().describe("One sentence with distinguishing details (fit, neckline, logo, buttons) that would help recognize it again"),
  box: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .describe("Bounding box of the garment in the photo, normalized 0-1: x,y = top-left corner, w,h = size"),
});

const Analysis = z.object({
  has_person_outfit: z.boolean().describe("false if the photo does not show worn clothing"),
  items: z.array(DetectedItem),
});

export type DetectedItem = z.infer<typeof DetectedItem>;

export type KnownItem = {
  id: string;
  name: string;
  category: string;
  colors: string[];
  pattern: string | null;
  description: string | null;
};

const SYSTEM_PROMPT = `You catalogue a person's wardrobe from their daily "get ready with me" outfit photos.

List ONLY the garments and accessories you can actually see the main person wearing or carrying in THIS photo: tops, bottoms, dresses, outerwear, shoes, bags, and clearly visible accessories (watch, belt, sunglasses, cap, scarf, jewellery).

Strict rules:
- Every item must be visibly present in the photo. Fill visible_evidence with where it is and what you can see. If you cannot point to it, leave it out.
- Never infer or assume items. If the feet are out of frame, list no shoes. If a bag, belt or watch isn't visible, don't list one.
- The wardrobe list below is ONLY for recognising items you can see. Never add an item because it is in the wardrobe list.
- One entry per physical item. Don't split one garment into several (e.g. a dress is not a top plus a skirt; a suit jacket is one item). A mirror shows the same outfit once: don't count reflections twice.
- Ignore other people, clothes on hangers, beds or chairs, and anything in the background.
- Layered pieces count only if part of them is actually visible (e.g. a shirt collar under a sweater).
- confidence is how sure you are the item is really there; use below 0.5 when you're unsure.

Matching: you are given the user's existing wardrobe as JSON. Set existing_item_id only when the visible garment is very likely the SAME physical item (same category, colours, pattern and distinguishing details), and give match_confidence. When unsure, set existing_item_id to null and match_confidence to 0 so a new item is created. Never match two garments to the same id.

Be precise with colours. Bounding boxes must tightly enclose only the visible part of each garment, in normalized coordinates (0-1).`;

/** Below this, the model wasn't sure the item is in the photo at all. */
export const MIN_CONFIDENCE = 0.6;
/** Below this, treat a claimed wardrobe match as a new item rather than risk a wrong link. */
export const MIN_MATCH_CONFIDENCE = 0.75;
/** Boxes smaller than this share of the photo are specks, not garments. */
const MIN_BOX_AREA = 0.0015;

const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h);

function overlap(a: Box, b: Box) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (area(a) + area(b) - inter);
}

/**
 * Keeps only items the model is confident are visible: drops low-confidence
 * and speck-sized detections, and duplicates (same category, mostly the same
 * box), and downgrades unsure wardrobe matches to new items.
 */
export function keepVisibleItems(items: DetectedItem[]): DetectedItem[] {
  // Most confident first, so a duplicate loses to the better detection.
  const kept = new Map<DetectedItem, DetectedItem>();
  for (const item of [...items].sort((a, b) => b.confidence - a.confidence)) {
    if (item.confidence < MIN_CONFIDENCE || area(item.box) < MIN_BOX_AREA) continue;
    const duplicate = [...kept.keys()].some((k) => k.category === item.category && overlap(k.box, item.box) > 0.6);
    if (duplicate) continue;
    const unsureMatch = item.existing_item_id && item.match_confidence < MIN_MATCH_CONFIDENCE;
    kept.set(item, unsureMatch ? { ...item, existing_item_id: null } : item);
  }
  // Back in the model's order (it lists top to bottom).
  return items.filter((i) => kept.has(i)).map((i) => kept.get(i)!);
}

export async function analyzeOutfitPhoto(
  image: { base64: string; mimeType: string },
  wardrobe: KnownItem[],
) {
  const openai = new OpenAI();

  const completion = await openai.chat.completions.parse({
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Existing wardrobe (${wardrobe.length} items):\n${JSON.stringify(wardrobe)}`,
          },
          {
            type: "image_url",
            image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail: "high" },
          },
        ],
      },
    ],
    response_format: zodResponseFormat(Analysis, "outfit_analysis"),
  });

  const message = completion.choices[0]?.message;
  if (message?.refusal) throw new Error(`Model refused: ${message.refusal}`);
  if (!message?.parsed) throw new Error("Model returned no structured result");
  return message.parsed;
}

/** Clamp to the photo and add a little breathing room around the garment. */
export function normalizeBox(box: Box, pad = 0.03): Box {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const x = clamp(box.x - pad);
  const y = clamp(box.y - pad);
  const w = clamp(box.x + box.w + pad) - x;
  const h = clamp(box.y + box.h + pad) - y;
  if (w <= 0.01 || h <= 0.01) return { x: 0, y: 0, w: 1, h: 1 };
  return { x, y, w, h };
}

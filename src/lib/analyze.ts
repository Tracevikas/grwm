import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { CATEGORIES, type Box } from "./types";

const DetectedItem = z.object({
  existing_item_id: z
    .string()
    .nullable()
    .describe("id of the matching item from the user's wardrobe list, or null if this garment is new"),
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

For the photo, list every distinct visible garment and accessory the person is wearing (tops, bottoms, dresses, outerwear, shoes, bags, and notable accessories like watches, belts, sunglasses, jewellery, caps). Ignore items that are not worn or carried, and ignore background objects.

You are also given the user's existing wardrobe as JSON. If a garment in the photo is very likely the same physical item as one already in the wardrobe (same category, color, pattern and distinguishing details), set existing_item_id to that item's id. Only match when confident; otherwise set it to null so a new item is created. Never match two garments to the same id.

Be precise with colors. Bounding boxes must tightly enclose each garment and use normalized coordinates (0-1).`;

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

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { feelOf, type Weather } from "./weather";
import type { Category } from "./types";

export const MOODS = ["energetic", "relaxed", "confident", "cozy", "professional", "playful"] as const;
export type Mood = (typeof MOODS)[number];

export const OCCASIONS = ["everyday", "work", "date", "party", "workout", "travel"] as const;
export type Occasion = (typeof OCCASIONS)[number];

/** What the stylist sees of each piece. */
export type StylistPiece = {
  id: string;
  name: string;
  category: Category;
  colors: string[];
  style: string | null;
  seasons: string[];
  times_worn: number;
  last_worn: string | null;
};

const Pick = z.object({
  title: z.string().describe("A short, catchy name for the look, 2–5 words"),
  item_ids: z.array(z.string()).describe("Ids of the chosen pieces, outermost/top first"),
  reason: z.string().describe("One or two friendly sentences on why this works for today's weather, mood and plans"),
});
export type TodayPick = z.infer<typeof Pick>;

const SYSTEM_PROMPT = `You are a personal stylist choosing today's outfit from the user's own wardrobe.

Rules:
- Use ONLY ids from the wardrobe list. Never invent pieces.
- A complete outfit is either a dress, or a top and a bottom. Add shoes when there are any. Outerwear, a bag and accessories are optional; add them when they suit the weather and occasion.
- Dress for the weather: layers and closed shoes when cold or rainy, light pieces when hot.
- Match the mood and occasion, and keep colours working together.
- Prefer pieces that haven't been worn lately, so the whole wardrobe gets used.
- If the wardrobe can't make a full outfit, pick the best partial one and say what's missing in the reason.`;

export async function pickTodayLook(
  wardrobe: StylistPiece[],
  context: { weather: Weather; mood: Mood; occasion: Occasion; avoid?: string[]; today: string },
): Promise<TodayPick> {
  const openai = new OpenAI();
  const { weather, mood, occasion, avoid = [], today } = context;
  const brief = [
    `Today is ${today}.`,
    `Weather: ${weather.tempC}°C, ${weather.condition} (${feelOf(weather.tempC).toLowerCase()}).`,
    `Mood: ${mood}. Occasion: ${occasion}.`,
    avoid.length ? `They just saw a look with ${avoid.join(", ")}: choose a noticeably different one.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await openai.chat.completions.parse({
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${brief}\n\nWardrobe (${wardrobe.length} pieces):\n${JSON.stringify(wardrobe)}` },
    ],
    response_format: zodResponseFormat(Pick, "today_look"),
  });

  const message = completion.choices[0]?.message;
  if (message?.refusal) throw new Error(`Model refused: ${message.refusal}`);
  if (!message?.parsed) throw new Error("Model returned no structured result");

  // Only real, distinct pieces from this wardrobe.
  const known = new Set(wardrobe.map((w) => w.id));
  const item_ids = [...new Set(message.parsed.item_ids)].filter((id) => known.has(id));
  return { ...message.parsed, item_ids };
}

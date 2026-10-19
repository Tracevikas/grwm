import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { MOODS, OCCASIONS, pickTodayLook, type StylistPiece } from "@/lib/today";
import { CONDITIONS } from "@/lib/weather";

export const maxDuration = 60;

const Body = z.object({
  weather: z.object({ tempC: z.number().min(-60).max(60), condition: z.enum(CONDITIONS) }),
  mood: z.enum(MOODS),
  occasion: z.enum(OCCASIONS),
  /** Pieces from the look they're re-rolling away from. */
  avoid: z.array(z.string()).max(12).optional(),
  /** The user's local date, YYYY-MM-DD. */
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Picks today's outfit from the signed-in user's wardrobe. */
export async function POST(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { data } = await supabase
    .from("wardrobe_items_with_stats")
    .select("id, name, category, colors, style, seasons, times_worn, last_worn");
  const wardrobe = (data ?? []) as StylistPiece[];
  if (wardrobe.length < 2) return NextResponse.json({ error: "Add a few more pieces first" }, { status: 422 });

  const names = new Map(wardrobe.map((w) => [w.id, w.name]));
  const avoid = (parsed.data.avoid ?? []).map((id) => names.get(id)).filter(Boolean) as string[];

  try {
    const pick = await pickTodayLook(wardrobe, { ...parsed.data, avoid });
    if (pick.item_ids.length === 0) return NextResponse.json({ error: "The stylist couldn't put a look together" }, { status: 502 });
    return NextResponse.json(pick);
  } catch {
    return NextResponse.json({ error: "The stylist is unavailable right now. Try again in a moment." }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { OutfitError, processOutfit } from "@/lib/process-outfit";
import { getUser } from "@/lib/supabase/server";

// Vision calls can take a while.
export const maxDuration = 60;

export async function POST(_req: Request, ctx: RouteContext<"/api/outfits/[id]/analyze">) {
  const { id } = await ctx.params;
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    return NextResponse.json(await processOutfit(supabase, id));
  } catch (err) {
    const status = err instanceof OutfitError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status });
  }
}

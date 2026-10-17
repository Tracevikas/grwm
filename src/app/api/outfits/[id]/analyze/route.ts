import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { OutfitError, processOutfit } from "@/lib/process-outfit";
import { getUser } from "@/lib/supabase/server";

// Vision analysis plus cut-outs.
export const maxDuration = 120;

export async function POST(_req: Request, ctx: RouteContext<"/api/outfits/[id]/analyze">) {
  const { id } = await ctx.params;
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const result = await processOutfit(supabase, id);
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof OutfitError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status });
  }
}

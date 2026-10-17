import { revalidatePath } from "next/cache";
import { after, NextResponse } from "next/server";
import { makeOutfitLook } from "@/lib/outfit-look";
import { OutfitError, processOutfit } from "@/lib/process-outfit";
import { getUser } from "@/lib/supabase/server";

// Vision analysis, then (after responding) the ChatGPT outfit image.
export const maxDuration = 300;

export async function POST(_req: Request, ctx: RouteContext<"/api/outfits/[id]/analyze">) {
  const { id } = await ctx.params;
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const result = await processOutfit(supabase, id);
    revalidatePath("/", "layout");
    // The pieces are saved; draw the background-free look without making the user wait.
    after(() => makeOutfitLook(supabase, id));
    return NextResponse.json({ ...result, look: "pending" });
  } catch (err) {
    const status = err instanceof OutfitError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status });
  }
}

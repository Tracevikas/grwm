import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { makeOutfitLook } from "@/lib/outfit-look";
import { signPhotos } from "@/lib/photos";
import { getUser } from "@/lib/supabase/server";

// Image generation at high quality can take up to a minute or two.
export const maxDuration = 300;

/** Draws the clean, background-free look for an analysed outfit and returns it. */
export async function POST(_req: Request, ctx: RouteContext<"/api/outfits/[id]/look">) {
  const { id } = await ctx.params;
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const path = await makeOutfitLook(supabase, id);
  revalidatePath("/", "layout");
  if (!path) return NextResponse.json({ error: "Couldn't draw the clean look" }, { status: 502 });

  const urls = await signPhotos(supabase, [path]);
  return NextResponse.json({ lookUrl: urls[path] });
}

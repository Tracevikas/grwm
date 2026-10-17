"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { deleteOutfitAndOrphans } from "@/lib/delete-outfit";
import { makeOutfitLook } from "@/lib/outfit-look";
import { PHOTO_BUCKET } from "@/lib/photos";
import { processOutfit } from "@/lib/process-outfit";
import { saveCutouts } from "@/lib/save-cutouts";
import { getUser } from "@/lib/supabase/server";
import { CATEGORIES, type Box, type Category } from "@/lib/types";

async function requireUser() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  return supabase;
}

/** The item's cut-out path, or null (also when the column doesn't exist yet). */
async function cutoutPathOf(supabase: Awaited<ReturnType<typeof requireUser>>, itemId: string) {
  const { data } = await supabase.from("wardrobe_items").select("cutout_path").eq("id", itemId).single();
  return (data?.cutout_path as string | null | undefined) ?? null;
}

export type CutoutState = { error?: string; done?: boolean };

/** (Re)makes an item's cut-out from its cover photo. */
export async function makeCutout(itemId: string): Promise<CutoutState> {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const { data: item, error } = await supabase
    .from("wardrobe_items")
    .select("id, name, category, subcategory, cover_box, cutout_path, cover:outfits!cover_outfit_id(photo_path)")
    .eq("id", itemId)
    .single();
  if (error?.message.includes("cutout_path")) {
    return { error: "Cut-outs need a one-time database update: run supabase/migrations/002_cutouts.sql." };
  }
  const photoPath = (item?.cover as { photo_path?: string } | null)?.photo_path;
  if (!item || !photoPath || !item.cover_box) return { error: "This piece has no photo to cut out from." };

  const { data: file } = await supabase.storage.from(PHOTO_BUCKET).download(photoPath);
  if (!file) return { error: "Couldn't read the photo for this piece." };

  const saved = await saveCutouts(supabase, user.id, Buffer.from(await file.arrayBuffer()), [
    {
      id: item.id,
      name: item.name,
      category: item.category as Category,
      subcategory: item.subcategory,
      box: item.cover_box as Box,
      previousPath: item.cutout_path,
    },
  ]).catch(() => 0);

  if (!saved) return { error: "Couldn't find this piece clearly enough to cut it out. The crop stays as it is." };
  refreshEverything();
  return { done: true };
}

/** Wardrobe, diary, item and outfit pages all derive from the same rows. */
function refreshEverything() {
  revalidatePath("/", "layout");
}

export async function reanalyzeOutfit(outfitId: string) {
  const supabase = await requireUser();
  // Failures are recorded on the outfit row and shown on its page.
  await processOutfit(supabase, outfitId).catch(() => null);
  after(() => makeOutfitLook(supabase, outfitId));
  refreshEverything();
}

export async function deleteOutfit(outfitId: string) {
  const supabase = await requireUser();
  await deleteOutfitAndOrphans(supabase, outfitId);
  refreshEverything();
  redirect("/outfits");
}

export async function updateItem(itemId: string, formData: FormData) {
  const supabase = await requireUser();
  const category = String(formData.get("category"));
  const csv = (key: string) =>
    String(formData.get(key) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  await supabase
    .from("wardrobe_items")
    .update({
      name: String(formData.get("name") ?? "").trim() || "Untitled",
      category: CATEGORIES.includes(category as Category) ? category : "other",
      colors: csv("colors"),
      description: String(formData.get("description") ?? "").trim() || null,
    })
    .eq("id", itemId);
  refreshEverything();
}

export async function deleteItem(itemId: string) {
  const supabase = await requireUser();
  const cutout = await cutoutPathOf(supabase, itemId);
  await supabase.from("wardrobe_items").delete().eq("id", itemId);
  if (cutout) await supabase.storage.from(PHOTO_BUCKET).remove([cutout]);
  refreshEverything();
  redirect("/");
}

/** Folds a duplicate into the item being viewed: moves its outfit links, then deletes it. */
export async function mergeItem(keepId: string, formData: FormData) {
  const supabase = await requireUser();
  const dropId = String(formData.get("duplicate"));
  if (!dropId || dropId === keepId) return;

  const { data: links } = await supabase.from("outfit_items").select("outfit_id, box").eq("item_id", dropId);
  if (links?.length) {
    await supabase
      .from("outfit_items")
      .upsert(links.map((l) => ({ ...l, item_id: keepId })), { onConflict: "outfit_id,item_id", ignoreDuplicates: true });
  }
  const cutout = await cutoutPathOf(supabase, dropId);
  await supabase.from("wardrobe_items").delete().eq("id", dropId);
  if (cutout) await supabase.storage.from(PHOTO_BUCKET).remove([cutout]);
  refreshEverything();
}

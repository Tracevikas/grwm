import type { SupabaseClient } from "@supabase/supabase-js";
import { signPhotos } from "./photos";
import type { Outfit, WardrobeItem } from "./types";

export type ItemWithPhoto = WardrobeItem & {
  photo: { url: string | undefined; w: number; h: number } | null;
  /** Signed URL of the transparent garment cut-out, when there is one. */
  cutoutUrl?: string;
};

/** Attaches the signed cover photo (and its dimensions) and cut-out to each item. */
export async function withCoverPhotos(
  supabase: SupabaseClient,
  items: WardrobeItem[],
): Promise<ItemWithPhoto[]> {
  const outfitIds = [...new Set(items.map((i) => i.cover_outfit_id).filter(Boolean))] as string[];

  const { data: outfits } = outfitIds.length
    ? await supabase.from("outfits").select("id, photo_path, photo_w, photo_h").in("id", outfitIds)
    : { data: [] };
  const byId = new Map(
    ((outfits ?? []) as Pick<Outfit, "id" | "photo_path" | "photo_w" | "photo_h">[]).map((o) => [o.id, o]),
  );
  const cutouts = items.map((i) => i.cutout_path).filter(Boolean) as string[];
  const urls = await signPhotos(supabase, [...[...byId.values()].map((o) => o.photo_path), ...cutouts]);

  return items.map((item) => {
    const o = item.cover_outfit_id ? byId.get(item.cover_outfit_id) : undefined;
    return {
      ...item,
      photo: o ? { url: urls[o.photo_path], w: o.photo_w, h: o.photo_h } : null,
      cutoutUrl: item.cutout_path ? urls[item.cutout_path] : undefined,
    };
  });
}

/** Cut-out paths for items, tolerating a database that predates cut-outs. */
export async function cutoutPaths(supabase: SupabaseClient, itemIds: string[]): Promise<Record<string, string>> {
  if (itemIds.length === 0) return {};
  const { data, error } = await supabase.from("wardrobe_items").select("id, cutout_path").in("id", itemIds);
  if (error) return {};
  const paths: Record<string, string> = {};
  for (const row of data ?? []) if (row.cutout_path) paths[row.id as string] = row.cutout_path as string;
  return paths;
}

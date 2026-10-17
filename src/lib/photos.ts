import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "outfits";

/** Signs many storage paths in one request. Returns path → signed URL. */
export async function signPhotos(
  supabase: SupabaseClient,
  paths: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(unique, 60 * 60);

  const urls: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) urls[row.path] = row.signedUrl;
  }
  return urls;
}

/** Pieces of a date-only string for big-number layouts: 17 / Fri / October 2026. */
export function dateParts(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return {
    day: d.getDate(),
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    month: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
  };
}

export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

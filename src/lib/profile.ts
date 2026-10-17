import type { SupabaseClient, User } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "./photos";

export type Profile = {
  name: string;
  email: string;
  avatarUrl: string | null;
  /** "google" or "email" */
  provider: string;
  joined: string;
};

export function profileOf(user: User): Profile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fromEmail = (user.email ?? "").split("@")[0];
  return {
    name: String(meta.full_name || meta.name || fromEmail || "You"),
    email: user.email ?? "",
    avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : typeof meta.picture === "string" ? meta.picture : null,
    provider: String(user.app_metadata?.provider ?? "email"),
    joined: user.created_at,
  };
}

/** Up to two initials for the avatar fallback. */
export function initials(name: string) {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase() || "?";
}

/**
 * Longest run of consecutive days, counting back from today (or yesterday, so
 * the streak survives until today's outfit is logged). `days` are YYYY-MM-DD.
 */
export function currentStreak(days: string[], today: string) {
  const set = new Set(days);
  const step = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  let day = set.has(today) ? today : step(today);
  let streak = 0;
  while (set.has(day)) {
    streak++;
    day = step(day);
  }
  return streak;
}

/** Every file under the user's folder (photos, cut-outs, product shots, looks). */
export async function listUserFiles(supabase: SupabaseClient, userId: string) {
  const files: string[] = [];
  const folders = [userId, `${userId}/cutouts`, `${userId}/products`, `${userId}/looks`];
  for (const folder of folders) {
    for (let offset = 0; ; offset += 1000) {
      const { data } = await supabase.storage.from(PHOTO_BUCKET).list(folder, { limit: 1000, offset });
      // Folders show up as entries without an id; only collect real files.
      const page = (data ?? []).filter((f) => f.id);
      files.push(...page.map((f) => `${folder}/${f.name}`));
      if ((data ?? []).length < 1000) break;
    }
  }
  return files;
}

/** Deletes all of the user's outfits, pieces and stored files. Keeps the account. */
export async function deleteAllUserData(supabase: SupabaseClient, userId: string) {
  const files = await listUserFiles(supabase, userId);
  // Outfits cascade to outfit_items; pieces are separate rows.
  await supabase.from("outfits").delete().eq("user_id", userId);
  await supabase.from("wardrobe_items").delete().eq("user_id", userId);
  for (let i = 0; i < files.length; i += 100) {
    await supabase.storage.from(PHOTO_BUCKET).remove(files.slice(i, i + 100));
  }
  return { files: files.length };
}

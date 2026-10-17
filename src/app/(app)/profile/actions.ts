"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteAllUserData } from "@/lib/profile";
import { getUser } from "@/lib/supabase/server";

export type ProfileState = { error?: string; saved?: boolean };

async function requireUser() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function updateName(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const { supabase } = await requireUser();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { error: "Enter a name." };
  const { error } = await supabase.auth.updateUser({ data: { full_name: name } });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { saved: true };
}

/** Wipes every outfit, piece and photo; the account stays. */
export async function deleteMyData(): Promise<ProfileState> {
  const { supabase, user } = await requireUser();
  await deleteAllUserData(supabase, user.id);
  revalidatePath("/", "layout");
  redirect("/");
}

/** Deletes the data, then the account itself (needs migration 004). */
export async function deleteMyAccount(): Promise<ProfileState> {
  const { supabase, user } = await requireUser();
  await deleteAllUserData(supabase, user.id);
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    return {
      error: error.message.includes("delete_my_account")
        ? "Account deletion needs a one-time database update: run supabase/migrations/004_delete_account.sql. Your outfits and pieces were deleted."
        : error.message,
    };
  }
  await supabase.auth.signOut();
  redirect("/login");
}

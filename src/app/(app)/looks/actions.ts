"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sanitizeLayout } from "@/lib/looks";
import { getUser } from "@/lib/supabase/server";
import type { LookSource } from "@/lib/types";

export type LookInput = {
  name?: string;
  source?: LookSource;
  layout?: unknown;
  note?: string | null;
  /** YYYY-MM-DD, or null to unplan. */
  planned_for?: string | null;
};

export type LookResult = { id?: string; error?: string };

const MIGRATION_HINT = "Saving looks needs a one-time database update: run supabase/migrations/005_looks_and_prices.sql.";
const SOURCES: LookSource[] = ["today", "shuffle", "canvas"];

async function requireUser() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  return supabase;
}

type Supabase = Awaited<ReturnType<typeof requireUser>>;

/** Only the fields that were sent, each checked. */
async function cleanInput(supabase: Supabase, input: LookInput) {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name.trim().slice(0, 80) || "Untitled look";
  if (input.source !== undefined) row.source = SOURCES.includes(input.source) ? input.source : "canvas";
  if (input.note !== undefined) row.note = input.note?.trim().slice(0, 500) || null;
  if (input.planned_for !== undefined) {
    row.planned_for = input.planned_for && /^\d{4}-\d{2}-\d{2}$/.test(input.planned_for) ? input.planned_for : null;
  }
  if (input.layout !== undefined) {
    const { data } = await supabase.from("wardrobe_items").select("id");
    row.layout = sanitizeLayout(input.layout, new Set((data ?? []).map((r) => r.id as string)));
  }
  return row;
}

export async function saveLook(input: LookInput): Promise<LookResult> {
  const supabase = await requireUser();
  const row = await cleanInput(supabase, input);
  if (!Array.isArray(row.layout) || row.layout.length === 0) return { error: "Add at least one piece to the look." };

  const { data, error } = await supabase.from("looks").insert(row).select("id").single();
  if (error) return { error: error.message.includes("looks") ? MIGRATION_HINT : "Couldn't save the look. Try again." };
  revalidatePath("/looks", "layout");
  return { id: data.id as string };
}

export async function updateLook(id: string, input: LookInput): Promise<LookResult> {
  const supabase = await requireUser();
  const row = await cleanInput(supabase, input);
  if (Array.isArray(row.layout) && row.layout.length === 0) return { error: "A look needs at least one piece." };

  const { error } = await supabase.from("looks").update(row).eq("id", id);
  if (error) return { error: "Couldn't save the look. Try again." };
  revalidatePath("/looks", "layout");
  return { id };
}

export async function deleteLook(id: string) {
  const supabase = await requireUser();
  await supabase.from("looks").delete().eq("id", id);
  revalidatePath("/looks", "layout");
  redirect("/looks");
}

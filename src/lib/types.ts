export const CATEGORIES = [
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "bag",
  "accessory",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  top: "Tops",
  bottom: "Bottoms",
  dress: "Dresses",
  outerwear: "Outerwear",
  shoes: "Shoes",
  bag: "Bags",
  accessory: "Accessories",
  other: "Other",
};

/** Normalized bounding box, all values 0–1 relative to the photo. */
export type Box = { x: number; y: number; w: number; h: number };

export type Outfit = {
  id: string;
  worn_on: string;
  photo_path: string;
  photo_w: number;
  photo_h: number;
  notes: string | null;
  status: "processing" | "done" | "failed";
  error: string | null;
  /** Background-free flat-lay from the OpenAI image model (after migration 003). */
  look_path?: string | null;
  look_status?: "pending" | "done" | "failed" | null;
  created_at: string;
};

export type WardrobeItem = {
  id: string;
  name: string;
  category: Category;
  subcategory: string | null;
  colors: string[];
  pattern: string | null;
  material: string | null;
  style: string | null;
  seasons: string[];
  description: string | null;
  cover_outfit_id: string | null;
  cover_box: Box | null;
  /** Missing until supabase/migrations/002_cutouts.sql has run. */
  cutout_path?: string | null;
  /** What it cost; missing until supabase/migrations/005_looks_and_prices.sql has run. */
  price?: number | null;
  created_at: string;
  times_worn: number;
  last_worn: string | null;
};

/** One piece placed on a look's board. x/y are the centre, 0–1 of the board. */
export type Placement = { item_id: string; x: number; y: number; scale: number; rotate: number };

export type LookSource = "today" | "shuffle" | "canvas";

export type Look = {
  id: string;
  name: string;
  source: LookSource;
  layout: Placement[];
  note: string | null;
  planned_for: string | null;
  created_at: string;
};

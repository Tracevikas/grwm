import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, fakeSupabase } from "./fake-supabase";

class Redirect extends Error {
  constructor(public url: string) {
    super(`REDIRECT ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

let fake = fakeSupabase();
let user: { id: string } | null = { id: "u1" };
vi.mock("@/lib/supabase/server", () => ({ getUser: async () => ({ supabase: fake.client, user }) }));

const processOutfit = vi.fn();
vi.mock("@/lib/process-outfit", () => ({ processOutfit: (...a: unknown[]) => processOutfit(...a) }));

const saveCutouts = vi.fn();
vi.mock("@/lib/save-cutouts", () => ({ saveCutouts: (...a: unknown[]) => saveCutouts(...a) }));

import { deleteItem, deleteOutfit, makeCutout, mergeItem, reanalyzeOutfit, updateItem } from "@/app/(app)/actions";

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

describe("app server actions", () => {
  beforeEach(() => {
    fake = fakeSupabase();
    user = { id: "u1" };
    processOutfit.mockReset();
  });

  it("send signed-out users to /login", async () => {
    user = null;
    await expect(deleteItem("i1")).rejects.toMatchObject({ url: "/login" });
    expect(fake.calls).toHaveLength(0);
  });

  describe("updateItem", () => {
    it("trims fields, splits colours and saves", async () => {
      await updateItem("i1", form({ name: "  Linen shirt ", category: "top", colors: "white, , beige ", description: "  " }));
      const [u] = callsTo(fake.calls, "wardrobe_items", "update");
      expect(u.payload).toEqual({ name: "Linen shirt", category: "top", colors: ["white", "beige"], description: null });
      expect(u.filters).toContainEqual(["eq", "id", "i1"]);
      expect(revalidatePath).toHaveBeenCalledWith("/items/i1");
    });

    it("rejects unknown categories and empty names", async () => {
      await updateItem("i1", form({ name: " ", category: "spaceship", colors: "" }));
      expect(callsTo(fake.calls, "wardrobe_items", "update")[0].payload).toMatchObject({ name: "Untitled", category: "other", colors: [] });
    });
  });

  describe("mergeItem", () => {
    it("moves the duplicate's outfits onto the kept item, then deletes it", async () => {
      fake = fakeSupabase((c) =>
        c.table === "outfit_items" && c.action === "select" ? { data: [{ outfit_id: "o1", box: null }, { outfit_id: "o2", box: { x: 0 } }] } : undefined,
      );
      await mergeItem("keep", form({ duplicate: "drop" }));

      const [up] = callsTo(fake.calls, "outfit_items", "upsert");
      expect(up.payload).toEqual([
        { outfit_id: "o1", box: null, item_id: "keep" },
        { outfit_id: "o2", box: { x: 0 }, item_id: "keep" },
      ]);
      const [del] = callsTo(fake.calls, "wardrobe_items", "delete");
      expect(del.filters).toContainEqual(["eq", "id", "drop"]);
    });

    it("does nothing when merging an item into itself", async () => {
      await mergeItem("keep", form({ duplicate: "keep" }));
      expect(fake.calls).toHaveLength(0);
    });

    it("still deletes a duplicate that has no outfits", async () => {
      fake = fakeSupabase((c) => (c.table === "outfit_items" ? { data: [] } : undefined));
      await mergeItem("keep", form({ duplicate: "drop" }));
      expect(callsTo(fake.calls, "outfit_items", "upsert")).toHaveLength(0);
      expect(callsTo(fake.calls, "wardrobe_items", "delete")).toHaveLength(1);
    });
  });

  it("deleteItem removes the item and returns to the wardrobe", async () => {
    await expect(deleteItem("i1")).rejects.toMatchObject({ url: "/" });
    expect(callsTo(fake.calls, "wardrobe_items", "delete")[0].filters).toContainEqual(["eq", "id", "i1"]);
  });

  it("deleteItem also deletes the item's cut-out file", async () => {
    fake = fakeSupabase((c) =>
      c.table === "wardrobe_items" && c.action === "select" ? { data: { cutout_path: "u1/cutouts/i1-ab.png" } } : undefined,
    );
    await expect(deleteItem("i1")).rejects.toMatchObject({ url: "/" });
    expect(fake.storage.remove).toHaveBeenCalledWith(["u1/cutouts/i1-ab.png"]);
  });

  it("mergeItem deletes the duplicate's cut-out file", async () => {
    fake = fakeSupabase((c) =>
      c.table === "wardrobe_items" && c.action === "select" ? { data: { cutout_path: "u1/cutouts/drop.png" } } : undefined,
    );
    await mergeItem("keep", form({ duplicate: "drop" }));
    expect(fake.storage.remove).toHaveBeenCalledWith(["u1/cutouts/drop.png"]);
  });

  describe("makeCutout", () => {
    const ITEM = {
      id: "i1",
      name: "Linen shirt",
      category: "top",
      subcategory: "shirt",
      cover_box: { x: 0.1, y: 0.1, w: 0.5, h: 0.4 },
      cutout_path: "u1/cutouts/i1-old.png",
      cover: { photo_path: "u1/p.jpg" },
    };
    const withItem = (item: unknown, error: { message: string } | null = null) =>
      fakeSupabase((c) => (c.table === "wardrobe_items" && c.action === "select" ? { data: item, error } : undefined));

    beforeEach(() => {
      saveCutouts.mockReset();
    });

    it("cuts the item out of its cover photo, replacing the old cut-out", async () => {
      fake = withItem(ITEM);
      saveCutouts.mockResolvedValue(1);

      await expect(makeCutout("i1")).resolves.toEqual({ done: true });
      expect(fake.storage.download).toHaveBeenCalledWith("u1/p.jpg");
      const [, userId, , [target]] = saveCutouts.mock.calls[0];
      expect(userId).toBe("u1");
      expect(target).toMatchObject({ id: "i1", category: "top", previousPath: "u1/cutouts/i1-old.png", box: ITEM.cover_box });
      expect(revalidatePath).toHaveBeenCalledWith("/items/i1");
    });

    it("explains when the model can't find the piece", async () => {
      fake = withItem(ITEM);
      saveCutouts.mockResolvedValue(0);
      await expect(makeCutout("i1")).resolves.toMatchObject({ error: expect.stringContaining("Couldn't find this piece") });
    });

    it("asks for the migration when the column is missing", async () => {
      fake = withItem(null, { message: "column wardrobe_items.cutout_path does not exist" });
      await expect(makeCutout("i1")).resolves.toMatchObject({ error: expect.stringContaining("002_cutouts.sql") });
      expect(saveCutouts).not.toHaveBeenCalled();
    });

    it("needs a cover photo", async () => {
      fake = withItem({ ...ITEM, cover: null });
      await expect(makeCutout("i1")).resolves.toMatchObject({ error: expect.stringContaining("no photo") });
    });
  });

  it("deleteOutfit deletes the row and its photo", async () => {
    fake = fakeSupabase((c) => (c.table === "outfits" && c.action === "select" ? { data: { photo_path: "u1/p.jpg" } } : undefined));
    await expect(deleteOutfit("o1")).rejects.toMatchObject({ url: "/outfits" });
    expect(callsTo(fake.calls, "outfits", "delete")).toHaveLength(1);
    expect(fake.storage.remove).toHaveBeenCalledWith(["u1/p.jpg"]);
  });

  it("deleteOutfit skips storage when the outfit is missing", async () => {
    await expect(deleteOutfit("o1")).rejects.toMatchObject({ url: "/outfits" });
    expect(fake.storage.remove).not.toHaveBeenCalled();
  });

  it("reanalyzeOutfit swallows failures (they are stored on the outfit) and refreshes the page", async () => {
    processOutfit.mockRejectedValue(new Error("model down"));
    await expect(reanalyzeOutfit("o1")).resolves.toBeUndefined();
    expect(processOutfit).toHaveBeenCalledWith(fake.client, "o1");
    expect(revalidatePath).toHaveBeenCalledWith("/outfits/o1");
  });
});

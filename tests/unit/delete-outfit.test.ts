import { describe, expect, it } from "vitest";
import { deleteOutfitAndOrphans } from "@/lib/delete-outfit";
import { callsTo, fakeSupabase, type Call } from "./fake-supabase";

const OUTFIT = { id: "o1", photo_path: "u1/o1.jpg", look_path: "u1/looks/o1.webp" };

/** Outfit o1 contains shirt (only here) and jeans (also worn in o2). */
function setup() {
  return fakeSupabase((call: Call) => {
    const eq = (col: string) => call.filters.find(([op, c]) => op === "eq" && c === col)?.[2];
    if (call.table === "outfits" && call.action === "select") return { data: OUTFIT };
    if (call.table === "outfit_items" && call.action === "select") {
      if (eq("outfit_id") === "o1") return { data: [{ item_id: "shirt" }, { item_id: "jeans" }] };
      if (eq("item_id") === "jeans") return { data: [{ outfit_id: "o2", box: { x: 0.1 } }] };
      return { data: [] };
    }
    if (call.table === "wardrobe_items" && call.action === "select") {
      return { data: [{ id: "shirt", cutout_path: "u1/cutouts/shirt.webp" }] };
    }
    return undefined;
  });
}

describe("deleteOutfitAndOrphans", () => {
  it("deletes the outfit, the pieces only it had, and all their files", async () => {
    const { client, calls, storage } = setup();
    await expect(deleteOutfitAndOrphans(client as never, "o1")).resolves.toEqual({ removedPieces: 1 });

    expect(callsTo(calls, "outfits", "delete")[0].filters).toContainEqual(["eq", "id", "o1"]);
    const [delItems] = callsTo(calls, "wardrobe_items", "delete");
    expect(delItems.filters).toContainEqual(["in", "id", ["shirt"]]);
    expect(storage.remove).toHaveBeenCalledWith(["u1/o1.jpg", "u1/looks/o1.webp", "u1/cutouts/shirt.webp"]);
  });

  it("keeps pieces worn elsewhere and gives them a cover photo from that outfit", async () => {
    const { client, calls } = setup();
    await deleteOutfitAndOrphans(client as never, "o1");

    const [cover] = callsTo(calls, "wardrobe_items", "update");
    expect(cover.payload).toEqual({ cover_outfit_id: "o2", cover_box: { x: 0.1 } });
    expect(cover.filters).toEqual(expect.arrayContaining([["eq", "id", "jeans"], ["is", "cover_outfit_id", null]]));
  });

  it("does nothing for an outfit that doesn't exist", async () => {
    const { client, calls, storage } = fakeSupabase();
    await expect(deleteOutfitAndOrphans(client as never, "nope")).resolves.toEqual({ removedPieces: 0 });
    expect(callsTo(calls, "outfits", "delete")).toHaveLength(0);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

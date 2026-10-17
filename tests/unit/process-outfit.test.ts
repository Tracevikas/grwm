import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DetectedItem } from "@/lib/analyze";
import { callsTo, fakeSupabase, type Call, type Result } from "./fake-supabase";

const analyzeOutfitPhoto = vi.fn();
vi.mock("@/lib/analyze", async (orig) => ({
  ...(await orig<typeof import("@/lib/analyze")>()),
  analyzeOutfitPhoto: (...args: unknown[]) => analyzeOutfitPhoto(...args),
}));

const saveCutouts = vi.fn();
vi.mock("@/lib/save-cutouts", () => ({ saveCutouts: (...args: unknown[]) => saveCutouts(...args) }));

import { OutfitError, processOutfit } from "@/lib/process-outfit";

const OUTFIT = { id: "o1", user_id: "user-1", photo_path: "user-1/a.jpg", photo_w: 900, photo_h: 1600 };
const JEANS = { id: "jeans", name: "Blue jeans", category: "bottom", colors: ["blue"], pattern: "solid", description: "" };

function detected(overrides: Partial<DetectedItem> = {}): DetectedItem {
  return {
    visible_evidence: "upper body, fully visible",
    confidence: 0.95,
    existing_item_id: null,
    match_confidence: 0.9,
    name: "White tee",
    category: "top",
    subcategory: "t-shirt",
    colors: ["white"],
    pattern: "solid",
    material: "cotton",
    style: "casual",
    seasons: ["summer"],
    description: "Plain crew neck",
    box: { x: 0.3, y: 0.2, w: 0.4, h: 0.3 },
    ...overrides,
  };
}

type SetupOpts = {
  outfit?: unknown;
  wardrobe?: unknown[];
  /** Ids returned by the "which matched items lack a cut-out" query. */
  missingCutouts?: string[];
  override?: (c: Call) => Result | undefined;
};

function setup(opts: SetupOpts = {}) {
  let n = 0;
  return fakeSupabase((call) => {
    const custom = opts.override?.(call);
    if (custom) return custom;
    if (call.table === "outfits" && call.action === "select") return { data: "outfit" in opts ? opts.outfit : OUTFIT };
    if (call.table === "wardrobe_items" && call.filters.some(([op]) => op === "is")) {
      return { data: (opts.missingCutouts ?? []).map((id) => ({ id })) };
    }
    if (call.table === "wardrobe_items" && call.action === "select") return { data: opts.wardrobe ?? [JEANS] };
    if (call.table === "wardrobe_items" && call.action === "insert") return { data: { id: `new-${++n}` } };
    return undefined;
  });
}

const statusUpdates = (calls: Call[]) =>
  callsTo(calls, "outfits", "update").map((c) => (c.payload as { status: string }).status);

describe("processOutfit", () => {
  beforeEach(() => {
    analyzeOutfitPhoto.mockReset();
    saveCutouts.mockReset();
    saveCutouts.mockResolvedValue(0);
  });

  describe("cut-outs", () => {
    it("cuts out new pieces and recognised pieces that lack one, after the outfit is saved", async () => {
      const { client, calls } = setup({ missingCutouts: ["jeans"] });
      analyzeOutfitPhoto.mockResolvedValue({
        has_person_outfit: true,
        items: [detected(), detected({ existing_item_id: "jeans", category: "bottom" })],
      });
      saveCutouts.mockResolvedValue(2);

      const result = await processOutfit(client as never, "o1");

      expect(result.cutouts).toBe(2);
      const [, userId, photo, targets] = saveCutouts.mock.calls[0];
      expect(userId).toBe("user-1");
      expect(Buffer.isBuffer(photo)).toBe(true);
      expect(targets.map((t: { id: string }) => t.id)).toEqual(["new-1", "jeans"]);
      expect(targets[1]).toMatchObject({ name: "Blue jeans", category: "bottom" });
      expect(statusUpdates(calls).at(-1)).toBe("done");
    });

    it("doesn't redo cut-outs for recognised pieces that already have one", async () => {
      const { client } = setup({ missingCutouts: [] });
      analyzeOutfitPhoto.mockResolvedValue({ has_person_outfit: true, items: [detected({ existing_item_id: "jeans" })] });
      await processOutfit(client as never, "o1");
      expect(saveCutouts.mock.calls[0][3]).toEqual([]);
    });

    it("skips cut-outs when the database hasn't been migrated", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { client } = setup({
        override: (c) => (c.filters.some(([op]) => op === "is") ? { error: { message: "column cutout_path does not exist" } } : undefined),
      });
      analyzeOutfitPhoto.mockResolvedValue({ has_person_outfit: true, items: [detected()] });

      expect(await processOutfit(client as never, "o1")).toMatchObject({ items: 1, cutouts: 0 });
      expect(saveCutouts).not.toHaveBeenCalled();
    });

    it("still saves the outfit when cutting out fails", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { client, calls } = setup();
      analyzeOutfitPhoto.mockResolvedValue({ has_person_outfit: true, items: [detected()] });
      saveCutouts.mockRejectedValue(new Error("model download failed"));

      expect(await processOutfit(client as never, "o1")).toMatchObject({ items: 1, cutouts: 0 });
      expect(statusUpdates(calls)).toEqual(["processing", "done"]);
    });
  });

  it("creates new items and links them with padded boxes", async () => {
    const { client, calls } = setup({ wardrobe: [] });
    analyzeOutfitPhoto.mockResolvedValue({ has_person_outfit: true, items: [detected(), detected({ name: "Black jeans", category: "bottom" })] });

    const result = await processOutfit(client as never, "o1");

    expect(result).toMatchObject({ items: 2, created: 2, matched: 0 });
    const inserts = callsTo(calls, "wardrobe_items", "insert");
    expect(inserts).toHaveLength(2);
    expect(inserts[0].payload).toMatchObject({ name: "White tee", category: "top", cover_outfit_id: "o1" });

    const [link] = callsTo(calls, "outfit_items", "insert");
    const rows = link.payload as { item_id: string; box: { x: number } }[];
    expect(rows.map((r) => r.item_id)).toEqual(["new-1", "new-2"]);
    expect(rows[0].box.x).toBeCloseTo(0.27);
    expect(statusUpdates(calls)).toEqual(["processing", "done"]);
  });

  it("reuses an existing wardrobe item the model recognised", async () => {
    const { client, calls } = setup();
    analyzeOutfitPhoto.mockResolvedValue({
      has_person_outfit: true,
      items: [detected({ existing_item_id: "jeans", category: "bottom" }), detected()],
    });

    expect(await processOutfit(client as never, "o1")).toMatchObject({ items: 2, created: 1, matched: 1 });
    const rows = callsTo(calls, "outfit_items", "insert")[0].payload as { item_id: string }[];
    expect(rows.map((r) => r.item_id)).toEqual(["jeans", "new-1"]);
  });

  it("passes the current wardrobe and photo to the model", async () => {
    const { client } = setup();
    analyzeOutfitPhoto.mockResolvedValue({ has_person_outfit: true, items: [detected()] });
    await processOutfit(client as never, "o1");

    const [image, wardrobe] = analyzeOutfitPhoto.mock.calls[0];
    expect(image).toEqual({ base64: Buffer.from([1, 2, 3]).toString("base64"), mimeType: "image/jpeg" });
    expect(wardrobe).toEqual([JEANS]);
  });

  it("ignores ids the model invented and creates a new item instead", async () => {
    const { client } = setup();
    analyzeOutfitPhoto.mockResolvedValue({ has_person_outfit: true, items: [detected({ existing_item_id: "made-up" })] });
    expect(await processOutfit(client as never, "o1")).toMatchObject({ created: 1, matched: 0 });
  });

  it("never links the same existing item twice in one outfit", async () => {
    const { client, calls } = setup();
    analyzeOutfitPhoto.mockResolvedValue({
      has_person_outfit: true,
      items: [
        detected({ existing_item_id: "jeans" }),
        detected({ existing_item_id: "jeans", name: "Other jeans", box: { x: 0.3, y: 0.55, w: 0.4, h: 0.3 } }),
      ],
    });

    expect(await processOutfit(client as never, "o1")).toMatchObject({ items: 2, created: 1, matched: 1 });
    const rows = callsTo(calls, "outfit_items", "insert")[0].payload as { item_id: string }[];
    expect(new Set(rows.map((r) => r.item_id)).size).toBe(2);
  });

  it("only saves pieces the model is confident are in the photo", async () => {
    const { client, calls } = setup({ wardrobe: [] });
    analyzeOutfitPhoto.mockResolvedValue({
      has_person_outfit: true,
      items: [detected(), detected({ name: "Maybe a watch", category: "accessory", confidence: 0.3, box: { x: 0.7, y: 0.4, w: 0.1, h: 0.1 } })],
    });

    expect(await processOutfit(client as never, "o1")).toMatchObject({ items: 1, created: 1 });
    expect(callsTo(calls, "wardrobe_items", "insert").map((c) => (c.payload as { name: string }).name)).toEqual(["White tee"]);
  });

  it("treats an unsure wardrobe match as a new piece instead of linking the wrong one", async () => {
    const { client } = setup();
    analyzeOutfitPhoto.mockResolvedValue({
      has_person_outfit: true,
      items: [detected({ existing_item_id: "jeans", match_confidence: 0.5 })],
    });
    expect(await processOutfit(client as never, "o1")).toMatchObject({ created: 1, matched: 0 });
  });

  it("422s when nothing confidently visible is left", async () => {
    const { client } = setup();
    analyzeOutfitPhoto.mockResolvedValue({ has_person_outfit: true, items: [detected({ confidence: 0.2 })] });
    await expect(processOutfit(client as never, "o1")).rejects.toMatchObject({ status: 422 });
  });

  it("on re-scan, deletes pieces it no longer finds if no other outfit has them", async () => {
    const { client, calls } = setup({
      override: (c) => {
        const eq = (col: string) => c.filters.find(([op, k]) => op === "eq" && k === col)?.[2];
        if (c.table === "outfit_items" && c.action === "select" && eq("outfit_id") === "o1") {
          return { data: [{ item_id: "old-pocket-square" }, { item_id: "jeans" }] };
        }
        if (c.table === "outfit_items" && c.action === "select" && eq("item_id")) return { data: [] };
        if (c.table === "wardrobe_items" && c.filters.some(([op, k]) => op === "in" && k === "id") && c.action === "select" && !c.filters.some(([op]) => op === "is")) {
          return { data: [{ id: "old-pocket-square", cutout_path: "u1/cutouts/sq.webp" }] };
        }
        return undefined;
      },
    });
    analyzeOutfitPhoto.mockResolvedValue({ has_person_outfit: true, items: [detected({ existing_item_id: "jeans", category: "bottom" })] });

    await processOutfit(client as never, "o1");
    const [del] = callsTo(calls, "wardrobe_items", "delete");
    expect(del.filters).toContainEqual(["in", "id", ["old-pocket-square"]]);
  });

  it("clears previous links before saving, so a re-scan replaces them", async () => {
    const { client, calls } = setup();
    analyzeOutfitPhoto.mockResolvedValue({ has_person_outfit: true, items: [detected()] });
    await processOutfit(client as never, "o1");

    const del = callsTo(calls, "outfit_items", "delete");
    expect(del).toHaveLength(1);
    expect(del[0].filters).toContainEqual(["eq", "outfit_id", "o1"]);
    expect(calls.indexOf(del[0])).toBeLessThan(calls.indexOf(callsTo(calls, "outfit_items", "insert")[0]));
  });

  it("404s when the outfit does not exist (or belongs to someone else)", async () => {
    const { client } = setup({ outfit: null });
    await expect(processOutfit(client as never, "nope")).rejects.toMatchObject({ status: 404 });
    expect(analyzeOutfitPhoto).not.toHaveBeenCalled();
  });

  it("422s and marks the outfit failed when no outfit is visible", async () => {
    const { client, calls } = setup();
    analyzeOutfitPhoto.mockResolvedValue({ has_person_outfit: false, items: [] });

    const err = await processOutfit(client as never, "o1").catch((e) => e);
    expect(err).toBeInstanceOf(OutfitError);
    expect(err.status).toBe(422);
    expect(statusUpdates(calls)).toEqual(["processing", "failed"]);
    expect(callsTo(calls, "outfit_items", "delete")).toHaveLength(0);
  });

  it("fails cleanly when the photo cannot be downloaded", async () => {
    const { client, storage, calls } = setup();
    storage.download.mockResolvedValueOnce({ data: null, error: { message: "gone" } } as never);

    await expect(processOutfit(client as never, "o1")).rejects.toThrow("Could not read the uploaded photo");
    expect(statusUpdates(calls)).toEqual(["processing", "failed"]);
  });

  it("records OpenAI errors on the outfit", async () => {
    const { client, calls } = setup();
    analyzeOutfitPhoto.mockRejectedValue(new Error("rate limited"));

    const err = await processOutfit(client as never, "o1").catch((e) => e);
    expect(err).toBeInstanceOf(OutfitError);
    expect(err.message).toBe("rate limited");
    expect(err.status).toBe(500);
    const failed = callsTo(calls, "outfits", "update").at(-1)!;
    expect(failed.payload).toEqual({ status: "failed", error: "rate limited" });
  });

  it("fails when a new item cannot be saved", async () => {
    const { client } = setup({
      override: (c) => (c.table === "wardrobe_items" && c.action === "insert" ? { data: null, error: { message: "bad category" } } : undefined),
    });
    analyzeOutfitPhoto.mockResolvedValue({ has_person_outfit: true, items: [detected()] });
    await expect(processOutfit(client as never, "o1")).rejects.toThrow('Could not save "White tee": bad category');
  });

  it("fails when the outfit links cannot be saved", async () => {
    const { client } = setup({
      override: (c) => (c.table === "outfit_items" && c.action === "insert" ? { error: { message: "fk" } } : undefined),
    });
    analyzeOutfitPhoto.mockResolvedValue({ has_person_outfit: true, items: [detected()] });
    await expect(processOutfit(client as never, "o1")).rejects.toThrow("Could not save outfit items: fk");
  });
});

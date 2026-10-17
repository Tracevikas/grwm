import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, fakeSupabase, type Call, type Result } from "./fake-supabase";

const edit = vi.fn();
vi.mock("openai", async (orig) => ({
  ...(await orig<typeof import("openai")>()),
  default: class {
    images = { edit };
  },
}));

import { lookPrompt, makeOutfitLook } from "@/lib/outfit-look";

const OUTFIT = {
  id: "o1",
  user_id: "u1",
  photo_path: "u1/photo.jpg",
  outfit_items: [
    { wardrobe_items: { name: "Navy oxford shirt", category: "top" } },
    { wardrobe_items: { name: "Light-wash jeans", category: "bottom" } },
  ],
};

function setup(override?: (c: Call) => Result | undefined, previousLook: string | null = null) {
  return fakeSupabase((call) => {
    const custom = override?.(call);
    if (custom) return custom;
    if (call.table !== "outfits" || call.action !== "select") return undefined;
    // First select loads the outfit; the later one reads the previous look path.
    return { data: { ...OUTFIT, look_path: previousLook } };
  });
}

const statuses = (calls: Call[]) =>
  callsTo(calls, "outfits", "update").map((c) => (c.payload as { look_status?: string }).look_status);

describe("makeOutfitLook", () => {
  beforeEach(() => {
    edit.mockReset();
    edit.mockResolvedValue({ data: [{ b64_json: Buffer.from("webp-bytes").toString("base64") }] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.unstubAllEnvs();
  });

  it("asks the image model for a transparent flat-lay of the photo", async () => {
    const { client } = setup();
    await makeOutfitLook(client as never, "o1");

    const req = edit.mock.calls[0][0];
    expect(req).toMatchObject({ model: "gpt-image-2.5-flare", background: "transparent", output_format: "webp", quality: "high", size: "1024x1536" });
    expect(req.image).toBeInstanceOf(File);
    expect(req.prompt).toContain("1. Navy oxford shirt (top)");
    expect(req.prompt).toContain("2. Light-wash jeans (bottom)");
    expect(req.prompt).toMatch(/Remove the person completely/);
  });

  it("uses OPENAI_IMAGE_MODEL when set", async () => {
    vi.stubEnv("OPENAI_IMAGE_MODEL", "gpt-image-2");
    const { client } = setup();
    await makeOutfitLook(client as never, "o1");
    expect(edit.mock.calls[0][0].model).toBe("gpt-image-2");
  });

  it("stores the image under the user's looks folder and marks it done", async () => {
    const { client, calls, storage } = setup();
    await expect(makeOutfitLook(client as never, "o1")).resolves.toMatch(/^u1\/looks\/o1-[0-9a-f]{8}\.webp$/);

    const [path, body, opts] = storage.upload.mock.calls[0] as unknown as [string, Buffer, object];
    expect(path).toMatch(/^u1\/looks\/o1-[0-9a-f]{8}\.webp$/);
    expect(body.toString()).toBe("webp-bytes");
    expect(opts).toEqual({ contentType: "image/webp" });

    expect(statuses(calls)).toEqual(["pending", "done"]);
    const done = callsTo(calls, "outfits", "update").at(-1)!;
    expect(done.payload).toEqual({ look_path: path, look_status: "done" });
  });

  it("replaces an earlier look and deletes its file", async () => {
    const { client, storage } = setup(undefined, "u1/looks/o1-old.webp");
    await makeOutfitLook(client as never, "o1");
    expect(storage.remove).toHaveBeenCalledWith(["u1/looks/o1-old.webp"]);
  });

  it("marks the look failed (but doesn't throw) when the model errors", async () => {
    edit.mockImplementation(async () => {
      throw new Error("content policy");
    });
    const { client, calls } = setup();
    await expect(makeOutfitLook(client as never, "o1")).resolves.toBeNull();
    expect(statuses(calls)).toEqual(["pending", "failed"]);
  });

  it("marks it failed when the model returns no image", async () => {
    edit.mockResolvedValue({ data: [] });
    const { client, calls } = setup();
    await expect(makeOutfitLook(client as never, "o1")).resolves.toBeNull();
    expect(statuses(calls)).toEqual(["pending", "failed"]);
  });

  it("skips quietly when the database hasn't been migrated", async () => {
    const { client } = setup((c) => (c.action === "update" ? { error: { message: "column look_status does not exist" } } : undefined));
    await expect(makeOutfitLook(client as never, "o1")).resolves.toBeNull();
    expect(edit).not.toHaveBeenCalled();
  });

  it("does nothing for a missing outfit", async () => {
    const { client } = fakeSupabase();
    await expect(makeOutfitLook(client as never, "nope")).resolves.toBeNull();
    expect(edit).not.toHaveBeenCalled();
  });
});

describe("lookPrompt", () => {
  // The waist-up blazer photo: only these two may appear, no invented trousers.
  const p = lookPrompt([
    { name: "Beige suit blazer", category: "outerwear", description: "Single-breasted, notch lapels, pocket square in breast pocket" },
    { name: "Black button-up shirt", category: "top" },
  ]);

  it("asks for exactly the listed pieces, numbered, with their details", () => {
    expect(p).toContain("Show EXACTLY these 2 pieces and nothing else");
    expect(p).toContain("1. Beige suit blazer (outerwear): Single-breasted, notch lapels, pocket square in breast pocket");
    expect(p).toContain("2. Black button-up shirt (top)");
  });

  it("forbids adding pieces that aren't listed, like trousers or shoes", () => {
    expect(p).toMatch(/Do not add any garment or accessory that is not listed: no trousers/);
    expect(p).toMatch(/Never invent the parts of the outfit that are out of frame/);
  });

  it("keeps attached details on their garment and removes person and background", () => {
    expect(p).toMatch(/a pocket square stays in the blazer pocket, not as a separate item/);
    expect(p).toMatch(/Remove the person completely/);
    expect(p).toMatch(/Remove the background completely/);
  });

  it("doesn't nudge the model toward a full top-to-bottom outfit", () => {
    expect(p).not.toMatch(/bottoms below|shoes at the bottom/);
  });

  it("uses singular wording for one piece", () => {
    expect(lookPrompt([{ name: "Kurta", category: "top" }])).toContain("Show EXACTLY these 1 piece");
  });
});

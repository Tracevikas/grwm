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
    expect(req).toMatchObject({ model: "gpt-image-2.5-flare", background: "transparent", output_format: "webp", size: "1024x1536" });
    expect(req.image).toBeInstanceOf(File);
    expect(req.prompt).toContain("Navy oxford shirt (top)");
    expect(req.prompt).toContain("Light-wash jeans (bottom)");
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
    await expect(makeOutfitLook(client as never, "o1")).resolves.toBe(true);

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
    await expect(makeOutfitLook(client as never, "o1")).resolves.toBe(false);
    expect(statuses(calls)).toEqual(["pending", "failed"]);
  });

  it("marks it failed when the model returns no image", async () => {
    edit.mockResolvedValue({ data: [] });
    const { client, calls } = setup();
    await expect(makeOutfitLook(client as never, "o1")).resolves.toBe(false);
    expect(statuses(calls)).toEqual(["pending", "failed"]);
  });

  it("skips quietly when the database hasn't been migrated", async () => {
    const { client } = setup((c) => (c.action === "update" ? { error: { message: "column look_status does not exist" } } : undefined));
    await expect(makeOutfitLook(client as never, "o1")).resolves.toBe(false);
    expect(edit).not.toHaveBeenCalled();
  });

  it("does nothing for a missing outfit", async () => {
    const { client } = fakeSupabase();
    await expect(makeOutfitLook(client as never, "nope")).resolves.toBe(false);
    expect(edit).not.toHaveBeenCalled();
  });
});

describe("lookPrompt", () => {
  it("lists every piece and forbids inventing details", () => {
    const p = lookPrompt([{ name: "Kurta", category: "top" }]);
    expect(p).toContain("- Kurta (top)");
    expect(p).toMatch(/Do not invent or restyle anything/);
    expect(p).toMatch(/Remove the background completely/);
  });
});

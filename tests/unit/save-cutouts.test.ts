import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, fakeSupabase } from "./fake-supabase";

const segmentPhoto = vi.fn();
const cutGarment = vi.fn();
vi.mock("@/lib/cutout", async (orig) => ({
  ...(await orig<typeof import("@/lib/cutout")>()),
  segmentPhoto: (...a: unknown[]) => segmentPhoto(...a),
  cutGarment: (...a: unknown[]) => cutGarment(...a),
}));

import { saveCutouts, type CutoutTarget } from "@/lib/save-cutouts";

const BOX = { x: 0.2, y: 0.2, w: 0.5, h: 0.4 };
const shirt: CutoutTarget = { id: "shirt", name: "Linen shirt", category: "top", box: BOX };
const watch: CutoutTarget = { id: "watch", name: "Gold watch", category: "accessory", box: BOX };
const photo = Buffer.from([1, 2, 3]);

describe("saveCutouts", () => {
  beforeEach(() => {
    segmentPhoto.mockReset();
    cutGarment.mockReset();
    segmentPhoto.mockResolvedValue({ width: 1, height: 1, rgb: Buffer.alloc(3), masks: new Map() });
    cutGarment.mockResolvedValue(Buffer.from("png"));
  });

  it("uploads a cut-out under the user's folder and records it on the item", async () => {
    const fake = fakeSupabase();
    expect(await saveCutouts(fake.client as never, "u1", photo, [shirt])).toBe(1);

    expect(segmentPhoto).toHaveBeenCalledWith(photo);
    const [path, body, opts] = fake.storage.upload.mock.calls[0] as unknown as [string, Buffer, object];
    expect(path).toMatch(/^u1\/cutouts\/shirt-[0-9a-f]{8}\.webp$/);
    expect(body.toString()).toBe("png");
    expect(opts).toEqual({ contentType: "image/webp" });

    const [update] = callsTo(fake.calls, "wardrobe_items", "update");
    expect(update.payload).toEqual({ cutout_path: path });
    expect(update.filters).toContainEqual(["eq", "id", "shirt"]);
  });

  it("skips the model entirely when nothing can be segmented", async () => {
    const fake = fakeSupabase();
    expect(await saveCutouts(fake.client as never, "u1", photo, [watch])).toBe(0);
    expect(segmentPhoto).not.toHaveBeenCalled();
  });

  it("segments once for many items", async () => {
    const fake = fakeSupabase();
    const pants = { ...shirt, id: "pants", category: "bottom" as const };
    expect(await saveCutouts(fake.client as never, "u1", photo, [shirt, pants, watch])).toBe(2);
    expect(segmentPhoto).toHaveBeenCalledTimes(1);
  });

  it("leaves items the model couldn't find alone", async () => {
    cutGarment.mockResolvedValue(null);
    const fake = fakeSupabase();
    expect(await saveCutouts(fake.client as never, "u1", photo, [shirt])).toBe(0);
    expect(fake.storage.upload).not.toHaveBeenCalled();
  });

  it("replaces an existing cut-out and deletes the old file", async () => {
    const fake = fakeSupabase();
    await saveCutouts(fake.client as never, "u1", photo, [{ ...shirt, previousPath: "u1/cutouts/shirt-old.png" }]);
    expect(fake.storage.remove).toHaveBeenCalledWith(["u1/cutouts/shirt-old.png"]);
  });

  it("removes the uploaded file if the item can't be updated", async () => {
    const fake = fakeSupabase((c) => (c.action === "update" ? { error: { message: "column does not exist" } } : undefined));
    expect(await saveCutouts(fake.client as never, "u1", photo, [shirt])).toBe(0);
    const uploaded = (fake.storage.upload.mock.calls[0] as unknown as [string])[0];
    expect(fake.storage.remove).toHaveBeenCalledWith([uploaded]);
  });

  it("carries on with other items when one fails", async () => {
    cutGarment.mockRejectedValueOnce(new Error("bad mask")).mockResolvedValue(Buffer.from("png"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = fakeSupabase();
    const pants = { ...shirt, id: "pants", category: "bottom" as const };
    expect(await saveCutouts(fake.client as never, "u1", photo, [shirt, pants])).toBe(1);
  });
});

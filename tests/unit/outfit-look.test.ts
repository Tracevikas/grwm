// @vitest-environment node
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, fakeSupabase, type Call, type Result } from "./fake-supabase";

const edit = vi.fn();
const parse = vi.fn();
vi.mock("openai", async (orig) => ({
  ...(await orig<typeof import("openai")>()),
  default: class {
    images = { edit };
    chat = { completions: { parse } };
  },
}));

/** What the shot check answers. */
const verdict = (ok: boolean) => ({
  choices: [{ message: { parsed: { what_it_shows: "x", shows_requested_item: ok, shows_other_items: false } } }],
});

import { composeLook, isProductShot, makeOutfitLook, piecePrompt, shotMatches } from "@/lib/outfit-look";

/** A small opaque PNG standing in for a generated product shot. */
const png = (w = 40, h = 60) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 180, b: 150, alpha: 1 } } }).png().toBuffer();

const SHIRT = { id: "shirt", name: "Black button-up shirt", category: "top", description: "Point collar", cutout_path: "u1/cutouts/shirt.webp" };
const BLAZER = { id: "blazer", name: "Beige blazer", category: "outerwear", description: "Pocket square in pocket", cutout_path: null };

function setup(pieces: object[], override?: (c: Call) => Result | undefined) {
  const fake = fakeSupabase((call) => {
    const custom = override?.(call);
    if (custom) return custom;
    if (call.table !== "outfits" || call.action !== "select") return undefined;
    return {
      data: { id: "o1", user_id: "u1", photo_path: "u1/photo.jpg", look_path: null, outfit_items: pieces.map((p) => ({ wardrobe_items: p })) },
    };
  });
  // Stored product shots and cut-outs are real images.
  fake.storage.download.mockImplementation(async () => ({ data: new Blob([new Uint8Array(PIECE_PNG)], { type: "image/png" }), error: null }));
  return fake;
}

let PIECE_PNG: Buffer;

const statuses = (calls: Call[]) =>
  callsTo(calls, "outfits", "update").map((c) => (c.payload as { look_status?: string }).look_status);

describe("makeOutfitLook", () => {
  beforeEach(async () => {
    edit.mockReset();
    parse.mockReset();
    parse.mockResolvedValue(verdict(true));
    PIECE_PNG = await png();
    const b64 = PIECE_PNG.toString("base64");
    edit.mockResolvedValue({ data: [{ b64_json: b64 }] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.unstubAllEnvs();
  });

  it("asks the image model for one transparent product shot per piece", async () => {
    const { client } = setup([SHIRT, BLAZER]);
    await makeOutfitLook(client as never, "o1");

    expect(edit).toHaveBeenCalledTimes(2);
    const prompts = edit.mock.calls.map((c) => c[0].prompt as string);
    expect(prompts.some((p) => p.includes("Beige blazer (outerwear): Pocket square in pocket"))).toBe(true);
    expect(prompts.some((p) => p.includes("Black button-up shirt (top): Point collar"))).toBe(true);
    for (const [req] of edit.mock.calls) {
      expect(req).toMatchObject({ model: "gpt-image-2.5-flare", background: "transparent", quality: "high" });
      expect(req.image).toBeInstanceOf(File);
    }
    // Tall garments get a portrait canvas.
    const requestFor = (name: string) => edit.mock.calls.find((c) => c[0].prompt.includes(`\n\n${name} (`))![0];
    expect(requestFor("Beige blazer").size).toBe("1024x1536");
    expect(requestFor("Black button-up shirt").size).toBe("1024x1024");
  });

  it("saves each shot as the piece's image, replacing its old cut-out", async () => {
    const { client, calls, storage } = setup([SHIRT]);
    await makeOutfitLook(client as never, "o1");

    const uploads = storage.upload.mock.calls.map((c) => (c as unknown as [string])[0]);
    const product = uploads.find((p) => p.includes("/products/"))!;
    expect(product).toMatch(/^u1\/products\/shirt-[0-9a-f]{8}\.webp$/);
    const [update] = callsTo(calls, "wardrobe_items", "update");
    expect(update.payload).toEqual({ cutout_path: product });
    expect(storage.remove).toHaveBeenCalledWith(["u1/cutouts/shirt.webp"]);
  });

  it("reuses a piece's existing product shot (after checking it) instead of paying for a new one", async () => {
    const { client } = setup([{ ...SHIRT, cutout_path: "u1/products/shirt-old.webp" }]);
    await expect(makeOutfitLook(client as never, "o1")).resolves.toMatch(/^u1\/looks\/o1-/);
    expect(edit).not.toHaveBeenCalled();
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("tells each request which other pieces not to show", async () => {
    const { client } = setup([SHIRT, BLAZER]);
    await makeOutfitLook(client as never, "o1");
    const shirtPrompt = edit.mock.calls.find((c) => c[0].prompt.includes("Extract ONLY this one item from the photo and show it as a clean catalogue product photo:\n\nBlack"))![0].prompt;
    expect(shirtPrompt).toContain("The photo also shows a Beige blazer. Do NOT show any of those.");
  });

  it("retries with a stricter prompt when the shot shows the wrong item", async () => {
    parse.mockResolvedValueOnce(verdict(false)).mockResolvedValue(verdict(true));
    const { client, calls } = setup([{ ...SHIRT, name: "Wristwatch", category: "accessory" }]);
    await makeOutfitLook(client as never, "o1");

    expect(edit).toHaveBeenCalledTimes(2);
    expect(edit.mock.calls[1][0].prompt).toMatch(/a previous attempt showed the wrong item/);
    expect(callsTo(calls, "wardrobe_items", "update")).toHaveLength(1);
  });

  it("never saves a shot that keeps showing the wrong item; keeps the cut-out instead", async () => {
    parse.mockResolvedValue(verdict(false));
    const { client, calls } = setup([{ ...SHIRT, name: "Wristwatch", category: "accessory" }]);
    await expect(makeOutfitLook(client as never, "o1")).resolves.toMatch(/^u1\/looks\//);
    expect(edit).toHaveBeenCalledTimes(2);
    expect(callsTo(calls, "wardrobe_items", "update")).toHaveLength(0);
  });

  it("clears an earlier wrong product shot that can't be replaced", async () => {
    parse.mockResolvedValue(verdict(false));
    const { client, calls, storage } = setup([{ ...SHIRT, name: "Wristwatch", category: "accessory", cutout_path: "u1/products/watch-wrong.webp" }]);
    await makeOutfitLook(client as never, "o1");

    expect(callsTo(calls, "wardrobe_items", "update")[0].payload).toEqual({ cutout_path: null });
    expect(storage.remove).toHaveBeenCalledWith(["u1/products/watch-wrong.webp"]);
  });

  it("stores the composed look and marks it done", async () => {
    const { client, calls, storage } = setup([SHIRT, BLAZER]);
    const path = await makeOutfitLook(client as never, "o1");

    expect(path).toMatch(/^u1\/looks\/o1-[0-9a-f]{8}\.webp$/);
    const look = storage.upload.mock.calls.find((c) => (c as unknown as [string])[0] === path) as unknown as [string, Buffer];
    expect((await sharp(look[1]).metadata()).format).toBe("webp");
    expect(statuses(calls)).toEqual(["pending", "done"]);
  });

  it("falls back to the cut-out when a piece can't be generated", async () => {
    edit.mockImplementation(async () => {
      throw new Error("content policy");
    });
    const { client, calls } = setup([SHIRT]);
    await expect(makeOutfitLook(client as never, "o1")).resolves.toMatch(/^u1\/looks\//);
    expect(callsTo(calls, "wardrobe_items", "update")).toHaveLength(0);
  });

  it("marks the look failed (without throwing) when no piece could be drawn", async () => {
    edit.mockImplementation(async () => {
      throw new Error("rate limited");
    });
    const { client, calls, storage } = setup([BLAZER]);
    storage.download.mockImplementation(async (path?: unknown) =>
      path === "u1/photo.jpg" ? { data: new Blob([new Uint8Array([1])], { type: "image/jpeg" }), error: null } : ({ data: null, error: { message: "nope" } } as never),
    );
    await expect(makeOutfitLook(client as never, "o1")).resolves.toBeNull();
    expect(statuses(calls)).toEqual(["pending", "failed"]);
  });

  it("skips quietly when the database hasn't been migrated", async () => {
    const { client } = setup([SHIRT], (c) => (c.table === "outfits" && c.action === "update" ? { error: { message: "column look_status does not exist" } } : undefined));
    await expect(makeOutfitLook(client as never, "o1")).resolves.toBeNull();
    expect(edit).not.toHaveBeenCalled();
  });

  it("does nothing for a missing outfit", async () => {
    const { client } = fakeSupabase();
    await expect(makeOutfitLook(client as never, "nope")).resolves.toBeNull();
    expect(edit).not.toHaveBeenCalled();
  });
});

describe("piecePrompt", () => {
  const p = piecePrompt({ name: "Beige suit blazer", category: "outerwear", description: "Notch lapels, pocket square in breast pocket" });

  it("asks for only this one item, copied exactly", () => {
    expect(p).toContain("Extract ONLY this one item");
    expect(p).toContain("Beige suit blazer (outerwear): Notch lapels, pocket square in breast pocket");
    expect(p).toMatch(/Copy it exactly from the photo/);
  });

  it("forbids other garments, the person and the background", () => {
    expect(p).toMatch(/no other garments or accessories, no person/);
    expect(p).toMatch(/no background/);
    expect(p).toMatch(/a pocket square stays in the blazer pocket/);
  });
});

describe("composeLook", () => {
  it("puts two pieces side by side on a transparent canvas", async () => {
    const look = await composeLook([await png(), await png()]);
    const m = await sharp(look).metadata();
    expect([m.width, m.height]).toEqual([1024, 666]);
    expect(m.hasAlpha).toBe(true);
  });

  it("adds rows for more pieces and centres a single one", async () => {
    const three = await sharp(await composeLook([await png(), await png(), await png()])).metadata();
    expect(three.height).toBe(666 * 2);
    const one = await sharp(await composeLook([await png()])).metadata();
    expect([one.width, one.height]).toEqual([1024, 1331]);
  });
});

describe("shotMatches", () => {
  beforeEach(() => {
    parse.mockReset();
  });

  it("passes only when the requested item is shown alone", async () => {
    const openai = new (await import("openai")).default();
    parse.mockResolvedValueOnce(verdict(true));
    expect(await shotMatches(openai, await png(), { name: "Blazer", category: "outerwear" })).toBe(true);

    parse.mockResolvedValueOnce({ choices: [{ message: { parsed: { what_it_shows: "x", shows_requested_item: true, shows_other_items: true } } }] });
    expect(await shotMatches(openai, await png(), { name: "Blazer", category: "outerwear" })).toBe(false);

    parse.mockResolvedValueOnce(verdict(false));
    expect(await shotMatches(openai, await png(), { name: "Watch", category: "accessory" })).toBe(false);
  });

  it("treats attached details as part of the item", async () => {
    const openai = new (await import("openai")).default();
    parse.mockResolvedValueOnce(verdict(true));
    await shotMatches(openai, await png(), { name: "Blazer", category: "outerwear" });
    expect(parse.mock.calls[0][0].messages[0].content[0].text).toMatch(/a pocket square in its pocket.*are part of it/);
  });
});

it("tells product shots from segmentation cut-outs", () => {
  expect(isProductShot("u1/products/a.webp")).toBe(true);
  expect(isProductShot("u1/cutouts/a.webp")).toBe(false);
  expect(isProductShot(null)).toBe(false);
});

// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { connectedRegions, cutGarment, labelsFor, type Segmentation } from "@/lib/cutout";

const W = 40;
const H = 60;

/** A plain photo with rectangular masks: label → [x0, y0, x1, y1) rectangles. */
function fakeSeg(rects: Record<string, [number, number, number, number][]>): Segmentation {
  const rgb = Buffer.alloc(W * H * 3, 200);
  const masks = new Map<string, Uint8Array>();
  for (const [label, list] of Object.entries(rects)) {
    const m = new Uint8Array(W * H);
    for (const [x0, y0, x1, y1] of list) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 255;
    masks.set(label, m);
  }
  return { width: W, height: H, rgb, masks };
}

const box = (x0: number, y0: number, x1: number, y1: number) => ({ x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H });

async function meta(png: Buffer | null) {
  expect(png).not.toBeNull();
  // WebP omits alpha when nothing is transparent, so always decode with one.
  const { data, info } = await sharp(png!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
  return { ...info, alphaAt };
}

describe("labelsFor", () => {
  it("maps categories to the model's garment labels", () => {
    expect(labelsFor({ category: "top", name: "Tee" })[0]).toEqual(["Upper-clothes"]);
    expect(labelsFor({ category: "bottom", name: "Jeans" })[0]).toEqual(["Pants", "Skirt"]);
    expect(labelsFor({ category: "shoes", name: "Sneakers" })[0]).toEqual(["Left-shoe", "Right-shoe"]);
    expect(labelsFor({ category: "dress", name: "Saree" })).toEqual([["Dress"], ["Upper-clothes", "Skirt", "Pants"]]);
  });

  it("recognises accessories from their name or subcategory", () => {
    expect(labelsFor({ category: "accessory", name: "Baseball cap" })).toEqual([["Hat"]]);
    expect(labelsFor({ category: "accessory", name: "Aviators", subcategory: "sunglasses" })).toEqual([["Sunglasses"]]);
    expect(labelsFor({ category: "accessory", name: "Silk dupatta" })).toEqual([["Scarf"]]);
  });

  it("returns nothing for things the model can't segment", () => {
    expect(labelsFor({ category: "accessory", name: "Gold watch" })).toEqual([]);
    expect(labelsFor({ category: "other", name: "Umbrella" })).toEqual([]);
  });
});

describe("connectedRegions", () => {
  it("labels separate blobs and counts their pixels", () => {
    // 1 1 0 0
    // 0 0 0 1
    // 0 0 1 1
    const on = new Uint8Array([1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1]);
    const { region, sizes } = connectedRegions(on, 4, 3);
    expect(sizes.slice(1).sort()).toEqual([2, 3]);
    expect(region[0]).toBe(region[1]);
    expect(region[7]).toBe(region[10]);
    expect(region[0]).not.toBe(region[7]);
    expect(region[2]).toBe(0);
  });
});

describe("cutGarment", () => {
  it("trims to the garment and makes everything else transparent", async () => {
    const seg = fakeSeg({ "Upper-clothes": [[10, 10, 30, 30]] });
    const m = await meta(await cutGarment(seg, [["Upper-clothes"]], box(8, 8, 32, 32)));
    expect([m.width, m.height]).toEqual([20, 20]);
    expect((await sharp((await cutGarment(seg, [["Upper-clothes"]], box(8, 8, 32, 32)))!).metadata()).format).toBe("webp");
    expect(m.alphaAt(10, 10)).toBe(255);
  });

  it("keeps the whole garment even when the box is too tight", async () => {
    const seg = fakeSeg({ "Upper-clothes": [[10, 10, 30, 50]] });
    // Box covers only the top part of the shirt.
    const m = await meta(await cutGarment(seg, [["Upper-clothes"]], box(10, 10, 30, 25)));
    expect(m.height).toBe(40);
  });

  it("ignores same-label regions outside the box", async () => {
    const seg = fakeSeg({ "Upper-clothes": [[2, 2, 12, 12], [20, 30, 38, 58]] });
    const m = await meta(await cutGarment(seg, [["Upper-clothes"]], box(20, 30, 38, 58)));
    expect([m.width, m.height]).toEqual([18, 28]);
  });

  it("combines labels, e.g. both shoes", async () => {
    const seg = fakeSeg({ "Left-shoe": [[4, 50, 16, 58]], "Right-shoe": [[24, 50, 36, 58]] });
    const m = await meta(await cutGarment(seg, [["Left-shoe", "Right-shoe"]], box(2, 48, 38, 60)));
    expect(m.width).toBe(32);
    // The gap between the shoes is transparent.
    expect(m.alphaAt(16, 4)).toBe(0);
  });

  it("falls back to the next label set", async () => {
    const seg = fakeSeg({ "Upper-clothes": [[10, 5, 30, 25]], Skirt: [[10, 25, 30, 45]] });
    const m = await meta(await cutGarment(seg, [["Dress"], ["Upper-clothes", "Skirt", "Pants"]], box(10, 5, 30, 45)));
    expect(m.height).toBe(40);
  });

  it("returns null when the garment is missing or too small for its box", async () => {
    // 4 pixels in a box covering the whole photo: under 4% coverage.
    const seg = fakeSeg({ "Upper-clothes": [[10, 10, 12, 12]] });
    expect(await cutGarment(seg, [["Pants"]], box(0, 0, 40, 60))).toBeNull();
    expect(await cutGarment(seg, [["Upper-clothes"]], box(0, 0, 40, 60))).toBeNull();
    expect(await cutGarment(seg, [], box(0, 0, 40, 60))).toBeNull();
  });
});

// @vitest-environment node
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assignCrops, flatLayPrompt, flatLayShots, splitFlatLay } from "@/lib/flat-lay";

const edit = vi.fn();
const parse = vi.fn();
const openai = { images: { edit }, chat: { completions: { parse } } } as never;
const photo = { data: Buffer.from([1, 2, 3]), type: "image/jpeg" };

type Rect = [number, number, number, number];
/** A transparent 400x400 canvas with opaque rectangles (x, y, w, h). */
async function canvas(rects: Rect[], opaqueBackground = false) {
  const layers = await Promise.all(
    rects.map(async ([x, y, w, h]) => ({
      input: await sharp({ create: { width: w, height: h, channels: 4, background: { r: 120, g: 90, b: 60, alpha: 1 } } }).png().toBuffer(),
      left: x,
      top: y,
    })),
  );
  const bg = opaqueBackground ? { r: 255, g: 255, b: 255, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 };
  return sharp({ create: { width: 400, height: 400, channels: 4, background: bg } }).composite(layers).png().toBuffer();
}

const size = async (b: Buffer) => {
  const m = await sharp(b).metadata();
  return [m.width, m.height];
};

const answer = (crops: { crop: number; piece: number | null }[]) => ({
  choices: [{ message: { parsed: { crops: crops.map((c) => ({ ...c, what_it_shows: "x" })) } } }],
});

const PIECES = [
  { name: "Beige blazer", category: "outerwear", description: "Pocket square in pocket" },
  { name: "Brown loafers", category: "shoes" },
];

describe("flatLayPrompt", () => {
  const p = flatLayPrompt(PIECES);

  it("asks for exactly the listed pieces, numbered", () => {
    expect(p).toContain("EXACTLY these 2 pieces");
    expect(p).toContain("1. Beige blazer (outerwear): Pocket square in pocket");
    expect(p).toContain("2. Brown loafers (shoes)");
  });

  it("asks for gaps between pieces, pairs kept together, and nothing added", () => {
    expect(p).toMatch(/wide empty gap between pieces: no two pieces may touch or overlap/);
    expect(p).toMatch(/A pair \(shoes, earrings, gloves\) is ONE piece/);
    expect(p).toMatch(/Do not add anything that is not listed/);
  });
});

describe("splitFlatLay", () => {
  it("cuts separate pieces apart, each tightly cropped", async () => {
    const crops = await splitFlatLay(await canvas([[20, 20, 120, 160], [240, 40, 100, 120]]));
    expect(crops).toHaveLength(2);
    const sizes = await Promise.all(crops.map(size));
    expect(sizes).toEqual(expect.arrayContaining([[120, 160], [100, 120]]));
  });

  it("keeps a pair of shoes together as one piece", async () => {
    const crops = await splitFlatLay(await canvas([[20, 20, 200, 200], [100, 300, 60, 40], [168, 300, 60, 40]]));
    expect(crops).toHaveLength(2);
    expect(await Promise.all(crops.map(size))).toEqual(expect.arrayContaining([[128, 40]]));
  });

  it("separates two garments laid out closer than a shoe pair, when it knows how many to expect", async () => {
    // A 10px gap: merged at the widest gap, split at a narrower one.
    const image = await canvas([[20, 20, 150, 200], [180, 20, 150, 200]]);
    expect(await splitFlatLay(image)).toHaveLength(1);
    expect(await splitFlatLay(image, 2)).toHaveLength(2);
  });

  it("still keeps a shoe pair together when that gives the expected count", async () => {
    const image = await canvas([[20, 20, 200, 200], [100, 300, 60, 40], [168, 300, 60, 40]]);
    const crops = await splitFlatLay(image, 2);
    expect(crops).toHaveLength(2);
    expect(await Promise.all(crops.map(size))).toEqual(expect.arrayContaining([[128, 40]]));
  });

  it("drops specks", async () => {
    const crops = await splitFlatLay(await canvas([[20, 20, 200, 200], [380, 380, 4, 4]]));
    expect(crops).toHaveLength(1);
  });

  it("never lets a neighbour's pixels into a crop", async () => {
    // An L-shaped piece whose bounding box contains a separate square piece.
    const crops = await splitFlatLay(await canvas([[20, 20, 340, 40], [20, 20, 40, 340], [220, 220, 100, 100]]));
    expect(crops).toHaveLength(2);
    const sizes = await Promise.all(crops.map(size));
    const l = crops[sizes.findIndex(([w]) => w === 340)];
    const { data, info } = await sharp(l).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Where the square sits inside the L's box, the L's crop must be empty.
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect(alphaAt(250, 250)).toBe(0);
    expect(alphaAt(5, 5)).toBe(255);
  });
});

describe("assignCrops", () => {
  beforeEach(() => {
    parse.mockReset();
  });

  it("maps each piece to the crop the vision model says shows it", async () => {
    parse.mockResolvedValue(answer([{ crop: 1, piece: 2 }, { crop: 2, piece: 1 }]));
    const crops = await splitFlatLay(await canvas([[20, 20, 120, 160], [240, 40, 100, 120]]));
    const map = await assignCrops(openai, crops, PIECES);
    expect([...map]).toEqual(expect.arrayContaining([[1, 0], [0, 1]]));

    const content = parse.mock.calls[0][0].messages[0].content;
    expect(content.filter((c: { type: string }) => c.type === "image_url")).toHaveLength(2);
    expect(content[0].text).toContain("1. Beige blazer (outerwear)");
  });

  it("drops ambiguous answers so those pieces get their own request", async () => {
    // Both crops claim the blazer; crop 3 is out of range; the loafers are unclaimed.
    parse.mockResolvedValue(answer([{ crop: 1, piece: 1 }, { crop: 2, piece: 1 }, { crop: 3, piece: 2 }]));
    const crops = await splitFlatLay(await canvas([[20, 20, 120, 160], [240, 40, 100, 120]]));
    expect((await assignCrops(openai, crops, PIECES)).size).toBe(0);
  });

  it("ignores crops that show none or several pieces (an invented extra, a merged pair)", async () => {
    parse.mockResolvedValue(answer([{ crop: 1, piece: 1 }, { crop: 2, piece: null }]));
    const crops = await splitFlatLay(await canvas([[20, 20, 120, 160], [240, 40, 100, 120]]));
    expect([...(await assignCrops(openai, crops, PIECES))]).toEqual([[0, 0]]);
  });
});

describe("flatLayShots", () => {
  const isTransparent = async (b: Buffer) => (await sharp(b).stats()).channels[3].min === 0;

  beforeEach(() => {
    edit.mockReset();
    parse.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("makes ONE image call for all pieces and returns a shot per matched piece", async () => {
    edit.mockResolvedValue({ data: [{ b64_json: (await canvas([[20, 20, 120, 160], [240, 40, 100, 120]])).toString("base64") }] });
    parse.mockResolvedValue(answer([{ crop: 1, piece: 1 }, { crop: 2, piece: 2 }]));

    const shots = await flatLayShots(openai, photo, PIECES, isTransparent);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(edit.mock.calls[0][0]).toMatchObject({ background: "transparent", output_format: "png", size: "1024x1024", quality: "high" });
    expect([...shots.keys()].sort()).toEqual([0, 1]);
  });

  it("returns nothing (so every piece gets its own request) when the background isn't transparent", async () => {
    edit.mockResolvedValue({ data: [{ b64_json: (await canvas([[20, 20, 120, 160]], true)).toString("base64") }] });
    expect((await flatLayShots(openai, photo, PIECES, isTransparent)).size).toBe(0);
    expect(parse).not.toHaveBeenCalled();
  });

  it("never throws when the image call fails", async () => {
    edit.mockImplementation(async () => {
      throw new Error("spend limit");
    });
    await expect(flatLayShots(openai, photo, PIECES, isTransparent)).resolves.toEqual(new Map());
  });
});

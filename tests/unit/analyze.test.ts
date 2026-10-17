import { beforeEach, describe, expect, it, vi } from "vitest";

const parse = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { parse } };
  },
}));

import { analyzeOutfitPhoto, keepVisibleItems, normalizeBox, type DetectedItem } from "@/lib/analyze";

const item = (o: Partial<DetectedItem>): DetectedItem => ({
  visible_evidence: "visible",
  confidence: 0.9,
  existing_item_id: null,
  match_confidence: 0,
  name: "Item",
  category: "top",
  subcategory: null,
  colors: [],
  pattern: null,
  material: null,
  style: null,
  seasons: [],
  description: "",
  box: { x: 0.2, y: 0.2, w: 0.5, h: 0.3 },
  ...o,
});

describe("keepVisibleItems", () => {
  it("drops items the model isn't confident are in the photo", () => {
    const out = keepVisibleItems([item({ name: "Shirt" }), item({ name: "Guessed shoes", category: "shoes", confidence: 0.4, box: { x: 0.3, y: 0.9, w: 0.4, h: 0.08 } })]);
    expect(out.map((i) => i.name)).toEqual(["Shirt"]);
  });

  it("drops speck-sized boxes", () => {
    expect(keepVisibleItems([item({ box: { x: 0.5, y: 0.5, w: 0.02, h: 0.02 } })])).toEqual([]);
  });

  it("keeps the more confident of two near-identical detections", () => {
    const out = keepVisibleItems([
      item({ name: "Tee", confidence: 0.7 }),
      item({ name: "Crew-neck tee", confidence: 0.95, box: { x: 0.21, y: 0.2, w: 0.5, h: 0.31 } }),
    ]);
    expect(out.map((i) => i.name)).toEqual(["Crew-neck tee"]);
  });

  it("keeps different categories even where they overlap (a shirt under a blazer)", () => {
    const out = keepVisibleItems([item({ name: "Shirt" }), item({ name: "Blazer", category: "outerwear" })]);
    expect(out).toHaveLength(2);
  });

  it("turns an unsure wardrobe match into a new item", () => {
    const [unsure, sure] = keepVisibleItems([
      item({ existing_item_id: "a", match_confidence: 0.6 }),
      item({ existing_item_id: "b", match_confidence: 0.9, category: "bottom", box: { x: 0.2, y: 0.6, w: 0.5, h: 0.3 } }),
    ]);
    expect(unsure.existing_item_id).toBeNull();
    expect(sure.existing_item_id).toBe("b");
  });

  it("keeps the model's top-to-bottom order", () => {
    const out = keepVisibleItems([
      item({ name: "Top", confidence: 0.7 }),
      item({ name: "Shoes", category: "shoes", confidence: 0.99, box: { x: 0.3, y: 0.85, w: 0.4, h: 0.1 } }),
    ]);
    expect(out.map((i) => i.name)).toEqual(["Top", "Shoes"]);
  });
});

const image = { base64: "AAAA", mimeType: "image/jpeg" };
const parsed = { has_person_outfit: true, items: [] };

describe("normalizeBox", () => {
  it("pads the box on every side", () => {
    const b = normalizeBox({ x: 0.2, y: 0.3, w: 0.4, h: 0.2 }, 0.05);
    expect(b.x).toBeCloseTo(0.15);
    expect(b.y).toBeCloseTo(0.25);
    expect(b.w).toBeCloseTo(0.5);
    expect(b.h).toBeCloseTo(0.3);
  });

  it("clamps boxes that run off the photo", () => {
    const b = normalizeBox({ x: -0.1, y: 0.9, w: 0.5, h: 0.5 }, 0);
    expect(b).toEqual({ x: 0, y: 0.9, w: 0.4, h: expect.closeTo(0.1) });
  });

  it("falls back to the whole photo for degenerate boxes", () => {
    expect(normalizeBox({ x: 0.5, y: 0.5, w: 0, h: 0 }, 0)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(normalizeBox({ x: 2, y: 2, w: 1, h: 1 })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe("analyzeOutfitPhoto", () => {
  beforeEach(() => {
    parse.mockReset();
  });

  it("sends the photo, the wardrobe and a strict JSON schema to the configured model", async () => {
    parse.mockResolvedValue({ choices: [{ message: { parsed } }] });
    const wardrobe = [{ id: "i1", name: "Blue jeans", category: "bottom", colors: ["blue"], pattern: null, description: null }];

    await expect(analyzeOutfitPhoto(image, wardrobe)).resolves.toEqual(parsed);

    const req = parse.mock.calls[0][0];
    expect(req.model).toBe("test-model");
    expect(req.response_format.type).toBe("json_schema");
    expect(req.response_format.json_schema.strict).toBe(true);

    const user = req.messages.find((m: { role: string }) => m.role === "user");
    const text = user.content.find((c: { type: string }) => c.type === "text").text;
    const img = user.content.find((c: { type: string }) => c.type === "image_url").image_url;
    expect(text).toContain('"id":"i1"');
    expect(img.url).toBe("data:image/jpeg;base64,AAAA");
  });

  it("defaults the model when OPENAI_MODEL is unset", async () => {
    vi.stubEnv("OPENAI_MODEL", "");
    parse.mockResolvedValue({ choices: [{ message: { parsed } }] });
    await analyzeOutfitPhoto(image, []);
    expect(parse.mock.calls[0][0].model).toBe("gpt-5-mini");
    vi.unstubAllEnvs();
  });

  it("throws when the model refuses", async () => {
    parse.mockResolvedValue({ choices: [{ message: { refusal: "nope", parsed: null } }] });
    await expect(analyzeOutfitPhoto(image, [])).rejects.toThrow("Model refused: nope");
  });

  it("throws when there is no structured result", async () => {
    parse.mockResolvedValue({ choices: [] });
    await expect(analyzeOutfitPhoto(image, [])).rejects.toThrow("no structured result");
  });

  it("tells the model to list only what is visible, never from the wardrobe list", async () => {
    parse.mockResolvedValue({ choices: [{ message: { parsed } }] });
    await analyzeOutfitPhoto(image, []);
    const system = parse.mock.calls[0][0].messages[0].content as string;
    expect(system).toMatch(/List ONLY the garments/);
    expect(system).toMatch(/Never add an item because it is in the wardrobe list/);
    expect(system).toMatch(/If the feet are out of frame, list no shoes/);
    const props = parse.mock.calls[0][0].response_format.json_schema.schema.properties.items.items.properties;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(["visible_evidence", "confidence", "match_confidence"]));
  });

  it("exposes a schema whose categories match the database check constraint", async () => {
    parse.mockResolvedValue({ choices: [{ message: { parsed } }] });
    await analyzeOutfitPhoto(image, []);
    const schema = parse.mock.calls[0][0].response_format.json_schema.schema;
    const category = schema.properties.items.items.properties.category;
    expect(category.enum).toEqual(["top", "bottom", "dress", "outerwear", "shoes", "bag", "accessory", "other"]);
  });
});

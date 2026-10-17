import { beforeEach, describe, expect, it, vi } from "vitest";

const parse = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { parse } };
  },
}));

import { analyzeOutfitPhoto, normalizeBox } from "@/lib/analyze";

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

  it("exposes a schema whose categories match the database check constraint", async () => {
    parse.mockResolvedValue({ choices: [{ message: { parsed } }] });
    await analyzeOutfitPhoto(image, []);
    const schema = parse.mock.calls[0][0].response_format.json_schema.schema;
    const category = schema.properties.items.items.properties.category;
    expect(category.enum).toEqual(["top", "bottom", "dress", "outerwear", "shoes", "bag", "accessory", "other"]);
  });
});

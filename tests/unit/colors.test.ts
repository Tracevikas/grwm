import { describe, expect, it } from "vitest";
import { spectrum, swatch } from "@/lib/colors";

describe("swatch", () => {
  it("maps known colour names regardless of case and spacing", () => {
    expect(swatch("Navy")).toBe("#1f2a4f");
    expect(swatch("  off-white ")).toBe("#f1ede4");
  });

  it("falls back to the last recognised word", () => {
    expect(swatch("dusty pink")).toBe(swatch("pink"));
    expect(swatch("washed-black")).toBe(swatch("black"));
  });

  it("uses a neutral grey for unknown names", () => {
    expect(swatch("chartreuse-ish")).toBe("#b7b9c4");
  });
});

describe("spectrum", () => {
  it("counts each item's main colour and orders bands light to dark", () => {
    const bands = spectrum([
      { colors: ["black"] },
      { colors: ["White", "black"] },
      { colors: ["navy"] },
      { colors: ["white"] },
      { colors: [] },
    ]);
    expect(bands.map((b) => [b.color, b.count])).toEqual([
      ["white", 2],
      ["navy", 1],
      ["black", 1],
    ]);
  });

  it("is empty for an empty wardrobe", () => {
    expect(spectrum([])).toEqual([]);
  });
});

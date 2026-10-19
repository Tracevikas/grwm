import { describe, expect, it } from "vitest";
import { costPerWear, flatLayLayout, sanitizeLayout, shuffleOutfit, type LookPiece } from "@/lib/looks";

const piece = (id: string, category: LookPiece["category"]): LookPiece => ({ id, category });
const wardrobe = [
  piece("t1", "top"),
  piece("t2", "top"),
  piece("b1", "bottom"),
  piece("d1", "dress"),
  piece("s1", "shoes"),
  piece("o1", "outerwear"),
  piece("g1", "bag"),
  piece("a1", "accessory"),
];

/** Always returns the same value, so picks and chances are predictable. */
const always = (n: number) => () => n;

describe("shuffleOutfit", () => {
  it("builds a top + bottom with shoes when separates win", () => {
    const outfit = shuffleOutfit(wardrobe, {}, always(0.9));
    expect(outfit.top).toBeDefined();
    expect(outfit.bottom?.id).toBe("b1");
    expect(outfit.shoes?.id).toBe("s1");
    expect(outfit.dress).toBeUndefined();
    // 0.9 is above the optional-layer chance, so no extras.
    expect(outfit.outerwear).toBeUndefined();
  });

  it("picks a dress (never with separates) when the dress wins", () => {
    const outfit = shuffleOutfit(wardrobe, {}, always(0.1));
    expect(outfit.dress?.id).toBe("d1");
    expect(outfit.top).toBeUndefined();
    expect(outfit.bottom).toBeUndefined();
    expect(outfit.outerwear?.id).toBe("o1");
  });

  it("keeps locked pieces and never pairs a dress with a locked top", () => {
    const t2 = wardrobe[1];
    const outfit = shuffleOutfit(wardrobe, { top: t2 }, always(0.1));
    expect(outfit.top).toBe(t2);
    expect(outfit.dress).toBeUndefined();
  });

  it("copes with a wardrobe of only dresses", () => {
    expect(shuffleOutfit([piece("d1", "dress")], {}, always(0.9))).toEqual({ dress: { id: "d1", category: "dress" } });
  });

  it("returns nothing for an empty wardrobe", () => {
    expect(shuffleOutfit([])).toEqual({});
  });
});

describe("flatLayLayout", () => {
  it("places each piece by kind, nudging repeats apart", () => {
    const [a, b] = flatLayLayout([piece("t1", "top"), piece("t2", "top")]);
    expect(a.item_id).toBe("t1");
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
  });
});

describe("sanitizeLayout", () => {
  it("drops unknown or repeated pieces and clamps numbers", () => {
    const out = sanitizeLayout(
      [
        { item_id: "t1", x: 2, y: -1, scale: 9, rotate: 400 },
        { item_id: "t1", x: 0.5, y: 0.5, scale: 0.3, rotate: 0 },
        { item_id: "nope", x: 0.5, y: 0.5, scale: 0.3, rotate: 0 },
        "junk",
      ],
      new Set(["t1"]),
    );
    expect(out).toEqual([{ item_id: "t1", x: 1, y: 0, scale: 1, rotate: 180 }]);
  });

  it("treats a non-array as empty", () => {
    expect(sanitizeLayout({ item_id: "t1" }, new Set(["t1"]))).toEqual([]);
  });
});

describe("costPerWear", () => {
  it("divides price by wears", () => expect(costPerWear(100, 4)).toBe(25));
  it("charges the full price before the first wear", () => expect(costPerWear(80, 0)).toBe(80));
  it("is null without a price", () => expect(costPerWear(null, 3)).toBeNull());
});

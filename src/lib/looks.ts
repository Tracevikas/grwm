import type { Category, Placement } from "./types";

/** The bits of a piece the look tools need. */
export type LookPiece = { id: string; category: Category };

/** Slots of an outfit, top of the body to the feet; "base" is a dress or a top + bottom. */
export const SLOTS = ["outerwear", "top", "bottom", "dress", "shoes", "bag", "accessory"] as const satisfies readonly Category[];
export type Slot = (typeof SLOTS)[number];

/** Optional layers only join some of the time, so shuffles vary. */
const OPTIONAL_CHANCE = 0.5;
/** When both are possible, how often the base is a dress rather than a top + bottom. */
const DRESS_CHANCE = 0.35;

function pick<T>(list: T[], rand: () => number): T | undefined {
  return list.length ? list[Math.floor(rand() * list.length)] : undefined;
}

/**
 * A random outfit from the wardrobe: a dress or a top + bottom, shoes when there are any,
 * and sometimes outerwear, a bag and an accessory. Locked slots keep their piece.
 */
export function shuffleOutfit<T extends LookPiece>(
  items: T[],
  locked: Partial<Record<Slot, T>> = {},
  rand: () => number = Math.random,
): Partial<Record<Slot, T>> {
  const of = (c: Slot) => items.filter((i) => i.category === c);
  const outfit: Partial<Record<Slot, T>> = {};

  const lockedSeparates = Boolean(locked.top || locked.bottom);
  const canDress = of("dress").length > 0 && !lockedSeparates;
  const canSeparates = of("top").length > 0 || of("bottom").length > 0;
  const wantDress = Boolean(locked.dress) || (canDress && (!canSeparates || rand() < DRESS_CHANCE));

  if (wantDress) {
    outfit.dress = locked.dress ?? pick(of("dress"), rand);
  } else {
    outfit.top = locked.top ?? pick(of("top"), rand);
    outfit.bottom = locked.bottom ?? pick(of("bottom"), rand);
  }
  outfit.shoes = locked.shoes ?? pick(of("shoes"), rand);
  for (const slot of ["outerwear", "bag", "accessory"] as const) {
    outfit[slot] = locked[slot] ?? (rand() < OPTIONAL_CHANCE ? pick(of(slot), rand) : undefined);
  }

  for (const slot of SLOTS) if (!outfit[slot]) delete outfit[slot];
  return outfit;
}

/** Where each kind of piece sits in a flat-lay: centre point and size, as shares of the board. */
const FLAT_LAY: Record<Category, Omit<Placement, "item_id">> = {
  outerwear: { x: 0.27, y: 0.3, scale: 0.46, rotate: -6 },
  top: { x: 0.55, y: 0.27, scale: 0.42, rotate: 0 },
  dress: { x: 0.52, y: 0.4, scale: 0.6, rotate: 0 },
  bottom: { x: 0.52, y: 0.64, scale: 0.44, rotate: 0 },
  shoes: { x: 0.3, y: 0.84, scale: 0.26, rotate: -8 },
  bag: { x: 0.8, y: 0.62, scale: 0.28, rotate: 6 },
  accessory: { x: 0.8, y: 0.2, scale: 0.2, rotate: 8 },
  other: { x: 0.78, y: 0.86, scale: 0.2, rotate: 0 },
};

/** Lays pieces out like a flat-lay, nudging repeats of the same kind so none hide another. */
export function flatLayLayout(pieces: LookPiece[]): Placement[] {
  const seen = new Map<Category, number>();
  return pieces.map((p) => {
    const n = seen.get(p.category) ?? 0;
    seen.set(p.category, n + 1);
    const spot = FLAT_LAY[p.category];
    return {
      item_id: p.id,
      x: clamp01(spot.x + n * 0.08),
      y: clamp01(spot.y + n * 0.06),
      scale: spot.scale,
      rotate: spot.rotate + n * 4,
    };
  });
}

/** Cleans a layout from the client: known pieces only, numbers in range, no repeats. */
export function sanitizeLayout(raw: unknown, knownIds: Set<string>): Placement[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Placement[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const { item_id, x, y, scale, rotate } = p as Record<string, unknown>;
    if (typeof item_id !== "string" || !knownIds.has(item_id) || seen.has(item_id)) continue;
    seen.add(item_id);
    out.push({
      item_id,
      x: clamp01(num(x, 0.5)),
      y: clamp01(num(y, 0.5)),
      scale: Math.min(1, Math.max(0.08, num(scale, 0.3))),
      rotate: Math.max(-180, Math.min(180, num(rotate, 0))),
    });
  }
  return out;
}

/** Price divided by wears; an unworn piece costs its full price per wear. */
export function costPerWear(price: number | null | undefined, timesWorn: number): number | null {
  if (price == null || !Number.isFinite(price)) return null;
  return price / Math.max(1, timesWorn);
}

export function formatMoney(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 2 : 0 });
}

function num(v: unknown, fallback: number) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

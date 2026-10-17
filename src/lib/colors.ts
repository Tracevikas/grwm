// Maps the plain colour names the vision model returns to swatches.
const SWATCHES: Record<string, string> = {
  black: "#1d1d1f",
  charcoal: "#3a3b3f",
  grey: "#9a9ca3",
  gray: "#9a9ca3",
  "light grey": "#c9cbd0",
  "light gray": "#c9cbd0",
  silver: "#c0c3c8",
  white: "#fbfbf9",
  "off-white": "#f1ede4",
  ivory: "#f4efdf",
  cream: "#efe6cf",
  beige: "#d9c6a3",
  tan: "#c8a57a",
  camel: "#b98b54",
  khaki: "#b7a776",
  brown: "#76503a",
  "dark brown": "#4d3426",
  chocolate: "#5a3a2a",
  rust: "#b0522b",
  orange: "#ec7a2c",
  peach: "#f4b996",
  coral: "#f07a6a",
  red: "#cf2e2e",
  maroon: "#6e1f2b",
  burgundy: "#6b1d34",
  wine: "#6b1d34",
  pink: "#f19bb6",
  "hot pink": "#e5336b",
  blush: "#efc4c4",
  magenta: "#c2287a",
  purple: "#6d3c99",
  lavender: "#b9a7dc",
  lilac: "#c6a9d8",
  navy: "#1f2a4f",
  "dark blue": "#1f3366",
  blue: "#2f62c4",
  "royal blue": "#2747b5",
  cobalt: "#1f4fbf",
  "light blue": "#9cc0e6",
  "sky blue": "#8ec5ea",
  denim: "#4a6c95",
  "light-wash denim": "#8aa7c4",
  "dark-wash denim": "#2e4466",
  teal: "#1f7a7a",
  turquoise: "#38b6b0",
  mint: "#a8dcc4",
  green: "#3d8a4f",
  "dark green": "#1f4a32",
  "bottle green": "#1f4a32",
  emerald: "#178a5e",
  olive: "#6b6b34",
  sage: "#a3b18a",
  mustard: "#d1a22a",
  yellow: "#f2cf3a",
  gold: "#c9a043",
  multicolor: "conic-gradient(#e5336b, #f2cf3a, #3d8a4f, #2f62c4, #e5336b)",
  multicolour: "conic-gradient(#e5336b, #f2cf3a, #3d8a4f, #2f62c4, #e5336b)",
};

export function swatch(name: string): string {
  const key = name.trim().toLowerCase();
  if (SWATCHES[key]) return SWATCHES[key];
  // "dusty pink", "washed black" → fall back to the last recognised word.
  const word = key.split(/[\s-]+/).reverse().find((w) => SWATCHES[w]);
  return word ? SWATCHES[word] : "#b7b9c4";
}

export type SpectrumBand = { color: string; swatch: string; count: number };

/** Counts each item's main colour and orders bands light → dark like a sorted rail. */
export function spectrum(items: { colors: string[] }[]): SpectrumBand[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const main = item.colors[0]?.trim().toLowerCase();
    if (main) counts.set(main, (counts.get(main) ?? 0) + 1);
  }
  return [...counts]
    .map(([color, count]) => ({ color, count, swatch: swatch(color) }))
    .sort((a, b) => lightness(b.swatch) - lightness(a.swatch));
}

function lightness(value: string) {
  const hex = value.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

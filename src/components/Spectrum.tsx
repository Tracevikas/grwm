import Link from "next/link";
import type { SpectrumBand } from "@/lib/colors";

type Props = {
  bands: SpectrumBand[];
  selected: string | null;
  hrefFor: (color: string | null) => string;
};

/** Your closet sorted by colour, light to dark. Tap a band to filter. */
export function Spectrum({ bands, selected, hrefFor }: Props) {
  if (bands.length === 0) return null;

  return (
    <div>
      <div className="flex h-14 gap-[3px] overflow-hidden rounded-2xl" role="list" aria-label="Wardrobe by colour">
        {bands.map((band, i) => {
          const isSelected = selected === band.color;
          return (
            <Link
              key={band.color}
              role="listitem"
              href={hrefFor(isSelected ? null : band.color)}
              aria-label={`${band.color}, ${band.count} ${band.count === 1 ? "piece" : "pieces"}`}
              aria-current={isSelected ? "true" : undefined}
              style={{ flexGrow: band.count, background: band.swatch, "--i": i } as React.CSSProperties}
              className={`grow-up min-w-3 basis-0 shadow-[inset_0_0_0_1px_rgba(43,30,23,0.08)] transition-[flex-grow,opacity,filter] duration-300 hover:brightness-110 active:brightness-95 ${
                selected && !isSelected ? "opacity-25" : ""
              }`}
            />
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        {selected ? (
          <>
            Showing <span className="font-medium capitalize text-foreground">{selected}</span>.{" "}
            <Link href={hrefFor(null)} className="underline underline-offset-2">
              Show every colour
            </Link>
          </>
        ) : (
          "Tap a colour to see only those pieces."
        )}
      </p>
    </div>
  );
}

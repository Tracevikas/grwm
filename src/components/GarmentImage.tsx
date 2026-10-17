import type { Box } from "@/lib/types";
import { CropImage } from "./CropImage";

type Props = {
  /** Transparent cut-out of just the garment; preferred when present. */
  cutoutUrl?: string;
  /** Fallback: the outfit photo cropped to the garment's box. */
  photoUrl: string | undefined;
  box: Box | null;
  photoW: number;
  photoH: number;
  alt: string;
  className?: string;
  aspect?: string;
  bg?: string;
};

/** A garment shown like a product shot when cut out, or as a crop of the outfit photo. */
export function GarmentImage({ cutoutUrl, photoUrl, box, photoW, photoH, alt, className = "", aspect = "aspect-square", bg = "bg-surface" }: Props) {
  if (!cutoutUrl) {
    return <CropImage src={photoUrl} box={box} photoW={photoW} photoH={photoH} alt={alt} className={className} aspect={aspect} bg={bg} />;
  }
  return (
    <div className={`relative flex ${aspect} items-center justify-center overflow-hidden p-[9%] ${bg} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cutoutUrl}
        alt={alt}
        loading="lazy"
        className="max-h-full max-w-full object-contain drop-shadow-[0_10px_14px_rgba(43,30,23,0.18)]"
      />
    </div>
  );
}

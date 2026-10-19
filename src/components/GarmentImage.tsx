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
    <div className={`relative flex ${aspect} items-center justify-center overflow-hidden ${bg} ${className}`}>
      {/* Sized as a share of this box, not with % padding: percentage padding is
          measured against the parent's width, which shrank row thumbnails to dots. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cutoutUrl}
        alt={alt}
        loading="lazy"
        className="h-[84%] w-[84%] object-contain drop-shadow-[0_10px_14px_rgba(80,60,120,0.18)]"
      />
    </div>
  );
}

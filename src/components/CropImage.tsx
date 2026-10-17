import type { CSSProperties } from "react";
import type { Box } from "@/lib/types";

type Props = {
  src: string | undefined;
  box: Box | null;
  photoW: number;
  photoH: number;
  alt: string;
  className?: string;
  /** Frame aspect class; the crop is letterboxed inside it. */
  aspect?: string;
  /** Letterbox background class. */
  bg?: string;
};

/**
 * Background styles that show only `box` of a photo, at the crop's real
 * aspect ratio, sized to fit a square container.
 */
export function cropStyle(src: string, box: Box | null, photoW: number, photoH: number): CSSProperties {
  const b = box ?? { x: 0, y: 0, w: 1, h: 1 };
  const ratio = (b.w * photoW) / (b.h * photoH);
  const pos = (start: number, size: number) => (size >= 1 ? 0 : (start / (1 - size)) * 100);

  return {
    aspectRatio: `${ratio}`,
    width: ratio >= 1 ? "100%" : "auto",
    height: ratio >= 1 ? "auto" : "100%",
    backgroundImage: `url("${src}")`,
    backgroundSize: `${100 / b.w}% ${100 / b.h}%`,
    backgroundPosition: `${pos(b.x, b.w)}% ${pos(b.y, b.h)}%`,
    backgroundRepeat: "no-repeat",
  };
}

/**
 * Shows just the part of an outfit photo inside `box`, letterboxed in a square
 * so garments of any shape keep their real proportions.
 */
export function CropImage({ src, box, photoW, photoH, alt, className = "", aspect = "aspect-square", bg = "bg-surface" }: Props) {
  return (
    <div className={`relative flex ${aspect} items-center justify-center overflow-hidden ${bg} ${className}`}>
      {src ? (
        <div role="img" aria-label={alt} style={cropStyle(src, box, photoW, photoH)} />
      ) : (
        <span className="text-xs text-muted">No photo</span>
      )}
    </div>
  );
}

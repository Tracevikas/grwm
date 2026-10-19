import type { CSSProperties } from "react";
import type { Box, Category, Placement } from "@/lib/types";
import { cropStyle } from "./CropImage";

/** What a board needs to draw a piece: its cut-out, or a crop of its outfit photo. */
export type BoardPiece = {
  id: string;
  name: string;
  category: Category;
  colors: string[];
  cutoutUrl?: string;
  photoUrl?: string;
  box: Box | null;
  photoW: number;
  photoH: number;
};

/** A piece's picture, fitted inside whatever box it's given. */
export function PieceArt({ piece, className = "" }: { piece: BoardPiece; className?: string }) {
  if (piece.cutoutUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={piece.cutoutUrl}
        alt={piece.name}
        draggable={false}
        className={`h-full w-full select-none object-contain drop-shadow-[0_12px_16px_rgba(80,60,120,0.22)] ${className}`}
      />
    );
  }
  return (
    <div className={`flex h-full w-full items-center justify-center ${className}`}>
      {piece.photoUrl ? (
        <div
          role="img"
          aria-label={piece.name}
          className="rounded-2xl shadow-[0_12px_20px_-10px_rgba(80,60,120,0.35)]"
          style={cropStyle(piece.photoUrl, piece.box, piece.photoW, piece.photoH)}
        />
      ) : (
        <span className="rounded-xl bg-surface-2 px-2 py-1 text-center text-xs text-muted">{piece.name}</span>
      )}
    </div>
  );
}

/** Where a placement sits on the board, as CSS. */
export function placementStyle(p: Placement, z: number): CSSProperties {
  return {
    left: `${p.x * 100}%`,
    top: `${p.y * 100}%`,
    width: `${p.scale * 100}%`,
    transform: `translate(-50%, -50%) rotate(${p.rotate}deg)`,
    zIndex: z,
  };
}

/** A saved look drawn as a flat-lay: each piece where it was placed. Read-only. */
export function LookBoard({
  layout,
  pieces,
  className = "",
  pieceClassName = "",
}: {
  layout: Placement[];
  pieces: Record<string, BoardPiece>;
  className?: string;
  /** On each piece's inner wrapper, free to animate (the outer one holds its placement). */
  pieceClassName?: string;
}) {
  return (
    <div className={`relative aspect-[4/5] overflow-hidden rounded-3xl bg-surface ${className}`}>
      {layout.map((p, i) => {
        const piece = pieces[p.item_id];
        if (!piece) return null;
        return (
          <div key={p.item_id} className="absolute aspect-square" style={placementStyle(p, i + 1)}>
            <div className={`h-full w-full ${pieceClassName}`}>
              <PieceArt piece={piece} />
            </div>
          </div>
        );
      })}
      {layout.every((p) => !pieces[p.item_id]) && (
        <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted">
          These pieces are no longer in your wardrobe.
        </p>
      )}
    </div>
  );
}

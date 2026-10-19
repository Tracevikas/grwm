import Link from "next/link";
import { ViewTransition } from "react";
import { swatch } from "@/lib/colors";
import type { ItemWithPhoto } from "@/lib/queries";
import { GarmentImage } from "./GarmentImage";
import { LinkPending } from "./LinkPending";
import { Tilt } from "./Motion";
import { WornAgo } from "./WornAgo";

export function ItemCard({ item, index = 0 }: { item: ItemWithPhoto; index?: number }) {
  return (
    <Link
      href={`/items/${item.id}`}
      transitionTypes={["nav-forward"]}
      style={{ "--i": index } as React.CSSProperties}
      className="group block rounded-[1.4rem] outline-offset-4"
    >
      <Tilt>
      <div className="relative rounded-[1.4rem] transition duration-200 group-hover:-translate-y-0.5 group-active:scale-[0.97]">
        {/* Same name as the hero on the item page, so the image morphs between them. */}
        <ViewTransition name={`item-${item.id}`} share="morph" default="none">
          <GarmentImage
            cutoutUrl={item.cutoutUrl}
            photoUrl={item.photo?.url}
            box={item.cover_box}
            photoW={item.photo?.w ?? 1}
            photoH={item.photo?.h ?? 1}
            alt={item.name}
            aspect="aspect-[4/5]"
            className="rounded-[1.4rem] transition-shadow duration-200 group-hover:shadow-[0_14px_28px_-18px_rgba(80,60,120,0.45)]"
          />
        </ViewTransition>
        <span className="absolute left-2.5 top-2.5 flex -space-x-1">
          {item.colors.slice(0, 3).map((c) => (
            <span key={c} title={c} className="h-3.5 w-3.5 rounded-full ring-2 ring-surface" style={{ background: swatch(c) }} />
          ))}
        </span>
        <LinkPending />
      </div>
      </Tilt>
      <p className="mt-2 line-clamp-1 px-1 text-[0.9rem] font-medium leading-snug">{item.name}</p>
      <p className="px-1 text-xs text-muted">
        {item.times_worn === 0 || !item.last_worn ? (
          "Not worn yet"
        ) : (
          <>
            {item.times_worn === 1 ? "1 wear" : `${item.times_worn} wears`}, <WornAgo date={item.last_worn} />
          </>
        )}
      </p>
    </Link>
  );
}

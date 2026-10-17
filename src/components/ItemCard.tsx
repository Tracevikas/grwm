import Link from "next/link";
import { swatch } from "@/lib/colors";
import type { ItemWithPhoto } from "@/lib/queries";
import { GarmentImage } from "./GarmentImage";
import { WornAgo } from "./WornAgo";

export function ItemCard({ item }: { item: ItemWithPhoto }) {
  return (
    <Link href={`/items/${item.id}`} className="group block rounded-[1.4rem] outline-offset-4">
      <div className="relative">
        <GarmentImage
          cutoutUrl={item.cutoutUrl}
          photoUrl={item.photo?.url}
          box={item.cover_box}
          photoW={item.photo?.w ?? 1}
          photoH={item.photo?.h ?? 1}
          alt={item.name}
          aspect="aspect-[4/5]"
          className="rounded-[1.4rem] transition group-active:scale-[0.98]"
        />
        <span className="absolute left-2.5 top-2.5 flex -space-x-1">
          {item.colors.slice(0, 3).map((c) => (
            <span key={c} title={c} className="h-3.5 w-3.5 rounded-full ring-2 ring-surface" style={{ background: swatch(c) }} />
          ))}
        </span>
      </div>
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

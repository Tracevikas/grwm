import Link from "next/link";
import { dateParts } from "@/lib/photos";
import type { Outfit } from "@/lib/types";

export type DiaryEntry = Outfit & { pieces: number; url: string | undefined };

export function DiaryView({ outfits }: { outfits: DiaryEntry[] }) {
  // Group by month; outfits arrive newest first.
  const months: { month: string; entries: DiaryEntry[] }[] = [];
  for (const o of outfits) {
    const { month } = dateParts(o.worn_on);
    if (months.at(-1)?.month !== month) months.push({ month, entries: [] });
    months.at(-1)!.entries.push(o);
  }

  return (
    <div className="space-y-8">
      <h1 className="display text-6xl font-bold">Diary</h1>

      {outfits.length === 0 ? (
        <div className="space-y-4">
          <p className="text-muted">Every outfit you log lands here, newest first.</p>
          <Link href="/log" className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink">
            Log today&apos;s outfit
          </Link>
        </div>
      ) : (
        months.map(({ month, entries }) => (
          <section key={month} className="space-y-3">
            <h2 className="flex items-baseline justify-between text-lg font-semibold">
              {month}
              <span className="text-sm font-normal text-muted">
                {entries.length} {entries.length === 1 ? "outfit" : "outfits"}
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {entries.map((o) => (
                <DiaryTile key={o.id} outfit={o} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function DiaryTile({ outfit: o }: { outfit: DiaryEntry }) {
  const { day, weekday } = dateParts(o.worn_on);
  return (
    <Link href={`/outfits/${o.id}`} className="group block rounded-t-full outline-offset-4">
      <div className="mirror relative aspect-[3/4] bg-surface-2 transition group-active:scale-[0.98]">
        {o.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.url} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/65 to-transparent p-3 pt-10 text-white">
          <span className="display text-4xl font-bold">{day}</span>
          <span className="text-right text-xs leading-tight">
            {weekday}
            <br />
            {o.pieces} {o.pieces === 1 ? "piece" : "pieces"}
          </span>
        </div>
        {o.status !== "done" && (
          <span className="absolute left-1/2 top-[22%] -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#2b1e17]">
            {o.status === "processing" ? "Reading photo…" : "Needs a re-scan"}
          </span>
        )}
      </div>
      {o.notes && <p className="mt-1.5 line-clamp-1 px-1 text-sm text-muted">{o.notes}</p>}
    </Link>
  );
}

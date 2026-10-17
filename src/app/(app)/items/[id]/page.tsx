import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink } from "@/components/BackLink";
import { CutoutButton } from "@/components/CutoutButton";
import { GarmentImage } from "@/components/GarmentImage";
import { PageSkeleton } from "@/components/PageSkeleton";
import { WornAgo } from "@/components/WornAgo";
import { swatch } from "@/lib/colors";
import { dateParts, signPhotos } from "@/lib/photos";
import { withCoverPhotos } from "@/lib/queries";
import { getUser } from "@/lib/supabase/server";
import { CATEGORIES, CATEGORY_LABELS, type Box, type Outfit, type WardrobeItem } from "@/lib/types";
import { deleteItem, makeCutout, mergeItem, updateItem } from "../../actions";

// "Cut out background" runs the segmentation model inside a server action here.
export const maxDuration = 60;

type Appearance = { box: Box | null; outfits: Outfit };

export default function ItemPage(props: PageProps<"/items/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ItemDetail {...props} />
    </Suspense>
  );
}

const field = "h-12 w-full rounded-xl bg-background px-3.5 outline-none focus:ring-2 focus:ring-accent-strong";

async function ItemDetail(props: PageProps<"/items/[id]">) {
  const { id } = await props.params;
  const { supabase } = await getUser();

  const [{ data: row }, { data: appearances }, { data: siblings }] = await Promise.all([
    supabase.from("wardrobe_items_with_stats").select("*").eq("id", id).single(),
    supabase.from("outfit_items").select("box, outfits(*)").eq("item_id", id),
    supabase.from("wardrobe_items").select("id, name, category").neq("id", id).order("name"),
  ]);
  if (!row) notFound();

  const [item] = await withCoverPhotos(supabase, [row as WardrobeItem]);
  const worn = ((appearances ?? []) as unknown as Appearance[])
    .filter((a) => a.outfits?.status === "done")
    .sort((a, b) => b.outfits.worn_on.localeCompare(a.outfits.worn_on));
  const urls = await signPhotos(supabase, worn.map((a) => a.outfits.photo_path));
  const sameCategory = (siblings ?? []).filter((s) => s.category === item.category);

  const facts = [
    ["Type", [CATEGORY_LABELS[item.category], item.subcategory].filter(Boolean).join(", ")],
    ["Pattern", item.pattern],
    ["Fabric", item.material],
    ["Style", item.style],
    ["Seasons", item.seasons.join(", ")],
  ].filter(([, v]) => v);

  return (
    <div className="space-y-7">
      <BackLink href="/">Wardrobe</BackLink>

      <div className="space-y-3">
        <GarmentImage
          cutoutUrl={item.cutoutUrl}
          photoUrl={item.photo?.url}
          box={item.cover_box}
          photoW={item.photo?.w ?? 1}
          photoH={item.photo?.h ?? 1}
          alt={item.name}
          aspect="aspect-[4/5]"
          className="mirror mx-auto w-4/5"
        />
        {item.photo && item.cover_box && (
          <CutoutButton action={makeCutout.bind(null, item.id)} hasCutout={Boolean(item.cutoutUrl)} />
        )}
      </div>

      <header className="space-y-3">
        <h1 className="display text-5xl font-bold">{item.name}</h1>
        <div className="flex flex-wrap gap-1.5">
          {item.colors.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-surface py-1 pl-1 pr-3 text-sm capitalize">
              <span className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: swatch(c) }} />
              {c}
            </span>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface p-4">
          <p className="display text-5xl font-bold">{item.times_worn}</p>
          <p className="mt-1 text-sm text-muted">{item.times_worn === 1 ? "time worn" : "times worn"}</p>
        </div>
        <div className="flex flex-col justify-end rounded-2xl bg-surface p-4">
          <p className="text-lg font-semibold leading-tight first-letter:uppercase">
            <WornAgo date={item.last_worn} />
          </p>
          <p className="mt-1 text-sm text-muted">last time</p>
        </div>
      </div>

      {item.description && <p className="text-[1.05rem] leading-relaxed">{item.description}</p>}

      {facts.length > 0 && (
        <dl className="divide-y divide-line">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium capitalize">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Worn in</h2>
        {worn.length === 0 ? (
          <p className="text-muted">Not in any outfit yet.</p>
        ) : (
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {worn.map(({ outfits: o }) => {
              const { day, weekday } = dateParts(o.worn_on);
              return (
                <Link key={o.id} href={`/outfits/${o.id}`} className="w-28 shrink-0">
                  <div className="mirror aspect-[3/4] bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urls[o.photo_path]} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <p className="mt-1.5 text-sm">
                    <span className="font-semibold">{day}</span> <span className="text-muted">{weekday}</span>
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="space-y-2">
        <details className="group rounded-2xl bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-medium">
            Edit details
            <Chevron />
          </summary>
          <form action={updateItem.bind(null, item.id)} className="space-y-3 px-4 pb-4">
            <label className="block text-sm text-muted">
              Name
              <input name="name" defaultValue={item.name} className={`${field} mt-1 text-foreground`} />
            </label>
            <label className="block text-sm text-muted">
              Category
              <select name="category" defaultValue={item.category} className={`${field} mt-1 text-foreground`}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-muted">
              Colours, separated by commas
              <input name="colors" defaultValue={item.colors.join(", ")} className={`${field} mt-1 text-foreground`} />
            </label>
            <label className="block text-sm text-muted">
              Notes
              <textarea name="description" defaultValue={item.description ?? ""} rows={3} className={`${field} mt-1 h-auto py-3 text-foreground`} />
            </label>
            <button className="h-12 w-full rounded-full bg-foreground font-semibold text-background">Save changes</button>
          </form>
        </details>

        {sameCategory.length > 0 && (
          <details className="group rounded-2xl bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-medium">
              Saved twice? Merge a duplicate
              <Chevron />
            </summary>
            <form action={mergeItem.bind(null, item.id)} className="space-y-3 px-4 pb-4">
              <p className="text-sm text-muted">Its outfits move to this piece, then the duplicate is removed.</p>
              <select name="duplicate" aria-label="Duplicate piece" className={field}>
                {sameCategory.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button className="h-12 w-full rounded-full bg-foreground font-semibold text-background">Merge into this piece</button>
            </form>
          </details>
        )}
      </div>

      <form action={deleteItem.bind(null, item.id)} className="text-center">
        <button className="rounded-full px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10">Remove from wardrobe</button>
      </form>
    </div>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

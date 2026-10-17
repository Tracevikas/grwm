import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { BackLink } from "@/components/BackLink";
import { GarmentImage } from "@/components/GarmentImage";
import { OutfitViewer } from "@/components/OutfitViewer";
import { PageSkeleton } from "@/components/PageSkeleton";
import { SubmitButton } from "@/components/SubmitButton";
import { swatch } from "@/lib/colors";
import { dateParts, signPhotos } from "@/lib/photos";
import { cutoutPaths } from "@/lib/queries";
import { getUser } from "@/lib/supabase/server";
import { CATEGORY_LABELS, type Box, type Outfit, type WardrobeItem } from "@/lib/types";
import { deleteOutfit, reanalyzeOutfit } from "../../actions";

// "Re-scan" runs the vision model inside a server action on this page.
export const maxDuration = 300;

type Link_ = { box: Box | null; wardrobe_items: Pick<WardrobeItem, "id" | "name" | "category" | "colors"> };

export default function OutfitPage(props: PageProps<"/outfits/[id]">) {
  return (
    <PageShell fallback={<PageSkeleton />}>
      <OutfitDetail {...props} />
    </PageShell>
  );
}

async function OutfitDetail(props: PageProps<"/outfits/[id]">) {
  const { id } = await props.params;
  const { supabase } = await getUser();

  const { data: outfit } = await supabase
    .from("outfits")
    .select("*, outfit_items(box, wardrobe_items(id, name, category, colors))")
    .eq("id", id)
    .single();
  if (!outfit) notFound();

  const o = outfit as Outfit & { outfit_items: Link_[] };
  const cutouts = await cutoutPaths(supabase, o.outfit_items.map((l) => l.wardrobe_items.id));
  const urls = await signPhotos(supabase, [o.photo_path, ...Object.values(cutouts), ...(o.look_path ? [o.look_path] : [])]);
  const url = urls[o.photo_path];
  const { day, weekday, month } = dateParts(o.worn_on);

  return (
    <div className="space-y-6">
      <BackLink href="/outfits">Diary</BackLink>

      <header className="flex items-end gap-4">
        <span className="display text-8xl font-bold">{day}</span>
        <div className="pb-2">
          <p className="text-lg font-semibold leading-tight">{weekday}</p>
          <p className="text-muted">{month}</p>
        </div>
      </header>
      {o.notes && <p className="text-lg">{o.notes}</p>}

      <OutfitViewer
        photoUrl={url}
        lookUrl={o.look_path ? urls[o.look_path] : undefined}
        lookStatus={o.look_status}
      />

      {o.status === "failed" && (
        <div className="rounded-2xl bg-accent/25 p-4 text-sm">
          <p className="font-semibold">We couldn&apos;t read this photo.</p>
          <p className="mt-1 text-muted">{o.error} Try a re-scan, or delete it and log a clearer, full-length photo.</p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {o.outfit_items.length} {o.outfit_items.length === 1 ? "piece" : "pieces"} in this look
        </h2>
        <ul className="space-y-2">
          {o.outfit_items.map(({ box, wardrobe_items: item }) => (
            <li key={item.id}>
              <Link href={`/items/${item.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-2 pr-4 transition active:scale-[0.99]">
                <GarmentImage
                  cutoutUrl={cutouts[item.id] ? urls[cutouts[item.id]] : undefined}
                  photoUrl={url}
                  box={box}
                  photoW={o.photo_w}
                  photoH={o.photo_h}
                  alt={item.name}
                  bg="bg-background"
                  className="w-16 shrink-0 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="text-sm text-muted">{CATEGORY_LABELS[item.category]}</p>
                </div>
                <span className="flex -space-x-1">
                  {item.colors.slice(0, 3).map((c) => (
                    <span key={c} title={c} className="h-4 w-4 rounded-full ring-2 ring-surface" style={{ background: swatch(c) }} />
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <form action={reanalyzeOutfit.bind(null, o.id)}>
          <SubmitButton pendingLabel="Re-scanning…" className="h-12 w-full rounded-full bg-surface text-sm font-semibold">
            Re-scan photo
          </SubmitButton>
        </form>
        <form action={deleteOutfit.bind(null, o.id)}>
          <SubmitButton pendingLabel="Deleting…" className="h-12 w-full rounded-full text-sm font-semibold text-danger ring-1 ring-danger/40">
            Delete outfit
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

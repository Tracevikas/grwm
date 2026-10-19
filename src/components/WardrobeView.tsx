import Link from "next/link";
import { ViewTransition } from "react";
import type { SpectrumBand } from "@/lib/colors";
import type { ItemWithPhoto } from "@/lib/queries";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/types";
import { CountUp } from "./CountUp";
import { InstallPrompt } from "./InstallPrompt";
import { ItemCard } from "./ItemCard";
import { Spectrum } from "./Spectrum";
import { ProfileLink } from "./ProfileLink";
import { Wordmark } from "./Wordmark";

export const SORTS = {
  recent: "Recently worn",
  forgotten: "Not worn lately",
  most: "Most worn",
  new: "Newest",
  value: "Best value",
} as const;
export type SortKey = keyof typeof SORTS;

export type WardrobeFilters = {
  category: Category | null;
  color: string | null;
  sort: SortKey;
  q: string;
};

type Props = {
  total: number;
  items: ItemWithPhoto[];
  bands: SpectrumBand[];
  filters: WardrobeFilters;
  /** Signed-in user, for the avatar link to their profile. */
  me?: { name: string; avatarUrl: string | null };
};

export function wardrobeHref(filters: WardrobeFilters, next: Partial<Record<keyof WardrobeFilters, string | null>>) {
  const merged = { ...filters, sort: filters.sort === "recent" ? null : filters.sort, ...next };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}

export function WardrobeView({ total, items, bands, filters, me }: Props) {
  const href = (next: Parameters<typeof wardrobeHref>[1]) => wardrobeHref(filters, next);
  const filtered = Boolean(filters.category || filters.color || filters.q);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Wordmark className="text-lg" />
        {me && <ProfileLink name={me.name} avatarUrl={me.avatarUrl} />}
      </div>

      <InstallPrompt />

      <div className="rise">
        <h1 className="text-2xl font-semibold tracking-tight">Your wardrobe</h1>
        <p className="mt-1 text-sm text-muted">
          <CountUp value={total} /> {total === 1 ? "piece" : "pieces"} · everything you own, in one place
        </p>
      </div>

      {total === 0 ? (
        <EmptyWardrobe />
      ) : (
        <>
          <Spectrum bands={bands} selected={filters.color} hrefFor={(color) => href({ color })} />

          <form action="/" className="relative">
            {filters.category && <input type="hidden" name="category" value={filters.category} />}
            {filters.color && <input type="hidden" name="color" value={filters.color} />}
            {filters.sort !== "recent" && <input type="hidden" name="sort" value={filters.sort} />}
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              name="q"
              type="search"
              defaultValue={filters.q}
              aria-label="Search your wardrobe"
              placeholder="White shirt, denim, kurta…"
              className="h-12 w-full rounded-full bg-surface pl-11 pr-4 text-[0.95rem] outline-none placeholder:text-muted"
            />
          </form>

          <div className="sticky top-0 z-10 -mx-4 bg-background/85 px-4 py-2 backdrop-blur">
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
              <Tab href={href({ category: null })} active={!filters.category}>Everything</Tab>
              {CATEGORIES.map((c) => (
                <Tab key={c} href={href({ category: c })} active={filters.category === c}>
                  {CATEGORY_LABELS[c]}
                </Tab>
              ))}
            </div>
            <div className="no-scrollbar mt-2 flex gap-4 overflow-x-auto text-sm">
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <Link
                  key={k}
                  href={href({ sort: k === "recent" ? null : k })}
                  aria-current={k === filters.sort ? "true" : undefined}
                  className={`shrink-0 py-1 ${k === filters.sort ? "font-semibold text-foreground underline decoration-accent decoration-[3px] underline-offset-[6px]" : "text-muted"}`}
                >
                  {SORTS[k]}
                </Link>
              ))}
            </div>
          </div>

          {items.length > 0 ? (
            // Changing a filter crossfades the grid (same place, different content).
            <ViewTransition key={`${filters.category}|${filters.color}|${filters.sort}|${filters.q}`} enter="tab-fade" exit="tab-fade" default="none">
              <div className="stagger grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">
                {items.map((item, i) => (
                  <ItemCard key={item.id} item={item} index={i} />
                ))}
              </div>
            </ViewTransition>
          ) : (
            <p className="py-12 text-center text-muted">
              Nothing matches that yet.{" "}
              {filtered && (
                <Link href="/" className="font-medium text-foreground underline underline-offset-2">
                  Clear filters
                </Link>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
        active ? "bg-accent text-accent-ink" : "bg-surface text-foreground hover:bg-surface-2"
      }`}
    >
      {children}
    </Link>
  );
}

function EmptyWardrobe() {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
      <p className="text-lg font-semibold">Your wardrobe is empty</p>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Take a mirror photo of today&apos;s outfit and every piece you&apos;re wearing is saved here.
      </p>
      <Link
        href="/log"
        className="mt-6 inline-flex items-center rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink shadow-sm shadow-accent/30 transition hover:opacity-90 active:opacity-80"
      >
        Log today&apos;s outfit
      </Link>
    </div>
  );
}

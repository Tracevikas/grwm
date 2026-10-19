import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { BackLink } from "@/components/BackLink";
import { CountUp } from "@/components/CountUp";
import { GarmentImage } from "@/components/GarmentImage";
import { InstallPrompt } from "@/components/InstallPrompt";
import { LinkPending } from "@/components/LinkPending";
import { PageShell } from "@/components/PageShell";
import { PageSkeleton } from "@/components/PageSkeleton";
import { DangerZone, NameForm, Streak } from "@/components/ProfileWidgets";
import { SubmitButton } from "@/components/SubmitButton";
import { spectrum } from "@/lib/colors";
import { costPerWear, formatMoney } from "@/lib/looks";
import { profileOf } from "@/lib/profile";
import { withCoverPhotos } from "@/lib/queries";
import { getUser } from "@/lib/supabase/server";
import { CATEGORIES, CATEGORY_LABELS, type WardrobeItem } from "@/lib/types";
import { signOut } from "../../login/actions";

export default function ProfilePage() {
  return (
    <PageShell fallback={<PageSkeleton />}>
      <Profile />
    </PageShell>
  );
}

async function Profile() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const me = profileOf(user);

  const [{ data: itemRows }, { data: outfitRows }] = await Promise.all([
    supabase.from("wardrobe_items_with_stats").select("*").order("times_worn", { ascending: false }),
    supabase.from("outfits").select("worn_on").eq("status", "done"),
  ]);
  const items = (itemRows ?? []) as WardrobeItem[];
  const days = [...new Set((outfitRows ?? []).map((o) => o.worn_on as string))];

  const mostWorn = items[0]?.times_worn ? (await withCoverPhotos(supabase, [items[0]]))[0] : null;
  const favouriteColour = [...spectrum(items)].sort((a, b) => b.count - a.count)[0];
  const byCategory = CATEGORIES.map((c) => ({ c, n: items.filter((i) => i.category === c).length }))
    .filter(({ n }) => n > 0)
    .sort((a, b) => b.n - a.n);
  const priced = items.filter((i) => i.price != null);
  const totalValue = priced.reduce((sum, i) => sum + Number(i.price), 0);
  const totalWears = priced.reduce((sum, i) => sum + i.times_worn, 0);
  const bestValue = [...priced].sort((a, b) => costPerWear(a.price, a.times_worn)! - costPerWear(b.price, b.times_worn)!)[0];
  const joined = new Date(me.joined).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="space-y-7">
      <BackLink href="/">Wardrobe</BackLink>

      <header className="rise flex items-center gap-4">
        <Avatar name={me.name} url={me.avatarUrl} className="h-20 w-20 text-2xl" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{me.name}</h1>
          <p className="truncate text-muted">{me.email}</p>
          <p className="mt-0.5 text-xs text-muted">
            Signed in with {me.provider === "google" ? "Google" : "an email link"}. Member since {joined}.
          </p>
        </div>
      </header>

      <section className="stagger grid grid-cols-2 gap-2" aria-label="Your stats">
        <div className="rounded-2xl bg-surface p-4" style={{ "--i": 0 } as React.CSSProperties}>
          <p className="display text-5xl font-bold">
            <CountUp value={items.length} />
          </p>
          <p className="mt-1 text-sm text-muted">{items.length === 1 ? "piece" : "pieces"} in your wardrobe</p>
        </div>
        <div className="rounded-2xl bg-surface p-4" style={{ "--i": 1 } as React.CSSProperties}>
          <p className="display text-5xl font-bold">
            <CountUp value={days.length} />
          </p>
          <p className="mt-1 text-sm text-muted">{days.length === 1 ? "day logged" : "days logged"}</p>
        </div>
        <div className="rounded-2xl bg-surface p-4" style={{ "--i": 2 } as React.CSSProperties}>
          <Streak days={days} />
        </div>
        <div className="rounded-2xl bg-surface p-4" style={{ "--i": 3 } as React.CSSProperties}>
          {favouriteColour ? (
            <>
              <span className="block h-12 w-12 rounded-full ring-1 ring-black/10" style={{ background: favouriteColour.swatch }} />
              <p className="mt-2 font-semibold capitalize">{favouriteColour.color}</p>
              <p className="text-sm text-muted">your most-owned colour</p>
            </>
          ) : (
            <p className="text-sm text-muted">Your favourite colour shows up here once you log an outfit.</p>
          )}
        </div>
      </section>

      {mostWorn && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Most worn</h2>
          <Link
            href={`/items/${mostWorn.id}`}
            transitionTypes={["nav-forward"]}
            className="relative flex items-center gap-4 rounded-2xl bg-surface p-3 pr-5 transition active:scale-[0.99]"
          >
            <GarmentImage
              cutoutUrl={mostWorn.cutoutUrl}
              photoUrl={mostWorn.photo?.url}
              box={mostWorn.cover_box}
              photoW={mostWorn.photo?.w ?? 1}
              photoH={mostWorn.photo?.h ?? 1}
              alt={mostWorn.name}
              bg="bg-background"
              className="w-20 shrink-0 rounded-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{mostWorn.name}</p>
              <p className="text-sm text-muted">Worn {mostWorn.times_worn} times</p>
            </div>
            <LinkPending />
          </Link>
        </section>
      )}

      {priced.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Wardrobe value</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-surface p-4">
              <p className="display text-3xl font-bold tabular-nums">{formatMoney(totalValue)}</p>
              <p className="mt-1 text-sm text-muted">
                spent on {priced.length} priced {priced.length === 1 ? "piece" : "pieces"}
              </p>
            </div>
            <div className="rounded-2xl bg-surface p-4">
              <p className="display text-3xl font-bold tabular-nums">{formatMoney(totalValue / Math.max(1, totalWears))}</p>
              <p className="mt-1 text-sm text-muted">average cost per wear</p>
            </div>
          </div>
          {bestValue && (
            <Link href={`/items/${bestValue.id}`} className="block rounded-2xl bg-accent/10 p-4 text-sm">
              Best value: <span className="font-semibold">{bestValue.name}</span> at{" "}
              {formatMoney(costPerWear(bestValue.price, bestValue.times_worn)!)} a wear.
            </Link>
          )}
          <Link href="/?sort=value" className="block text-center text-sm font-medium text-accent-strong">
            Sort wardrobe by best value →
          </Link>
        </section>
      )}

      {byCategory.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Wardrobe mix</h2>
          <ul className="space-y-2.5">
            {byCategory.map(({ c, n }, i) => (
              <li key={c} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="text-muted">{CATEGORY_LABELS[c]}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="grow-x block h-full rounded-full bg-accent"
                    style={{ width: `${(n / byCategory[0].n) * 100}%`, "--i": i } as React.CSSProperties}
                  />
                </span>
                <span className="text-right font-medium tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-[1.5rem] bg-surface p-4">
        <NameForm name={me.name} />
      </section>

      <InstallPrompt />

      <form action={signOut}>
        <SubmitButton pendingLabel="Signing out…" className="h-12 w-full rounded-full bg-surface font-semibold">
          Sign out
        </SubmitButton>
      </form>

      <DangerZone pieces={items.length} outfits={days.length} />
    </div>
  );
}

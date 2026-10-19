import Link from "next/link";
import { LinkPending } from "@/components/LinkPending";
import { LookBoard } from "@/components/LookBoard";
import { LooksCalendar } from "@/components/LooksCalendar";
import { Reveal, Tilt } from "@/components/Motion";
import { PageShell } from "@/components/PageShell";
import { PageSkeleton } from "@/components/PageSkeleton";
import { loadBoardPieces } from "@/lib/queries";
import { getUser } from "@/lib/supabase/server";
import type { Look } from "@/lib/types";

export default function LooksPage() {
  return (
    <PageShell fallback={<PageSkeleton />}>
      <Looks />
    </PageShell>
  );
}

async function Looks() {
  const { supabase } = await getUser();
  const [{ data, error }, { data: outfits }, pieces] = await Promise.all([
    supabase.from("looks").select("*").order("created_at", { ascending: false }).limit(60),
    supabase.from("outfits").select("worn_on").eq("status", "done"),
    loadBoardPieces(supabase),
  ]);
  const looks = (data ?? []) as Look[];
  const byId = Object.fromEntries(pieces.map((p) => [p.id, p]));
  const planned = looks.filter((l) => l.planned_for).map((l) => ({ id: l.id, name: l.name, date: l.planned_for! }));

  return (
    <div className="space-y-7">
      <div className="rise">
        <h1 className="text-2xl font-semibold tracking-tight">Looks</h1>
        <p className="mt-1 text-sm text-muted">Mix, arrange and plan outfits from what you own.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ToolCard href="/looks/shuffle" title="Dress Me" body="Shuffle a random outfit" icon="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6C14.3 16 15.5 17 17.5 17H21M18 14l3 3-3 3M3 17h3.5c1.4 0 2.4-.5 3.2-1.3M14.3 8.3c.8-.8 1.8-1.3 3.2-1.3H21M18 4l3 3-3 3" />
        <ToolCard href="/looks/new" title="Canvas" body="Arrange a flat-lay" icon="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />
      </div>

      {error ? (
        <p className="rounded-2xl bg-accent/10 p-4 text-sm">
          Saved looks need a one-time database update: run <code className="font-mono">supabase/migrations/005_looks_and_prices.sql</code> in the
          Supabase SQL editor.
        </p>
      ) : (
        <>
          <LooksCalendar planned={planned} worn={[...new Set((outfits ?? []).map((o) => o.worn_on as string))]} />

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Saved looks</h2>
            {looks.length === 0 ? (
              <p className="text-sm text-muted">Looks you save from Today, Dress Me or the canvas show up here.</p>
            ) : (
              <Reveal className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
                {looks.map((look) => (
                  <Link key={look.id} href={`/looks/${look.id}`} transitionTypes={["nav-forward"]} className="reveal group relative block">
                    <Tilt>
                      <LookBoard layout={look.layout} pieces={byId} className="shadow-[0_18px_36px_-24px_rgba(80,60,120,0.5)]" />
                    </Tilt>
                    <p className="mt-2 line-clamp-1 px-1 text-sm font-medium">{look.name}</p>
                    <p className="px-1 text-xs text-muted">
                      {look.planned_for
                        ? `Planned for ${new Date(`${look.planned_for}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
                        : `${look.layout.length} ${look.layout.length === 1 ? "piece" : "pieces"}`}
                    </p>
                    <LinkPending />
                  </Link>
                ))}
              </Reveal>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ToolCard({ href, title, body, icon }: { href: string; title: string; body: string; icon: string }) {
  return (
    <Tilt>
      <Link
        href={href}
        transitionTypes={["nav-forward"]}
        className="relative flex aspect-[5/4] flex-col justify-between overflow-hidden rounded-3xl bg-accent p-4 text-accent-ink shadow-[0_20px_40px_-22px_rgba(140,100,190,0.8)] transition active:scale-[0.98]"
      >
        <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/25 blur-xl" aria-hidden />
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={icon} />
        </svg>
        <span>
          <span className="block text-lg font-semibold">{title}</span>
          <span className="block text-sm opacity-90">{body}</span>
        </span>
        <LinkPending />
      </Link>
    </Tilt>
  );
}

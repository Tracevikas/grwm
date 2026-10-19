"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveLook } from "@/app/(app)/looks/actions";
import { dealIn, gsap, reducedMotion, useGSAP } from "@/lib/gsap";
import { flatLayLayout, SLOTS, shuffleOutfit, type Slot } from "@/lib/looks";
import { CATEGORY_LABELS } from "@/lib/types";
import { BackLink } from "./BackLink";
import { PieceArt, type BoardPiece } from "./LookBoard";
import { Spinner } from "./Spinner";
import { EmptyCard } from "./TodayView";
import { primaryButton, secondaryButton } from "./ui";

type Outfit = Partial<Record<Slot, BoardPiece>>;

export function ShuffleView({ pieces }: { pieces: BoardPiece[] }) {
  const router = useRouter();
  const [outfit, setOutfit] = useState<Outfit>({});
  const [locked, setLocked] = useState<Partial<Record<Slot, true>>>({});
  // Which slots just changed, so only those cards flip in.
  const [fresh, setFresh] = useState<{ slots: Slot[]; roll: number }>({ slots: [], roll: 0 });
  const [busy, setBusy] = useState(false);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scope = useRef<HTMLDivElement>(null);

  const lockedPieces = useMemo(
    () => Object.fromEntries(Object.keys(locked).map((s) => [s, outfit[s as Slot]]).filter(([, p]) => p)) as Outfit,
    [locked, outfit],
  );

  // Random, so it's dealt on the first frame after hydration rather than on the server.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const first = shuffleOutfit(pieces);
      setOutfit(first);
      setFresh({ slots: Object.keys(first) as Slot[], roll: 1 });
    });
    return () => cancelAnimationFrame(frame);
  }, [pieces]);

  useGSAP(
    () => {
      if (!fresh.roll) return;
      const targets = fresh.slots.map((s) => `[data-slot="${s}"] .card-face`).join(",");
      if (targets) dealIn(targets, { stagger: 0.07 });
    },
    { scope, dependencies: [fresh] },
  );

  /** Flips the unlocked cards away, then deals the new ones in. `only` re-rolls a single slot. */
  function shuffle(only?: Slot) {
    if (busy) return;
    const keep: Outfit = only
      ? Object.fromEntries(SLOTS.filter((s) => s !== only && outfit[s]).map((s) => [s, outfit[s]]))
      : lockedPieces;
    let next = shuffleOutfit(pieces, keep);
    // A single-slot re-roll should actually change that piece when it can.
    for (let i = 0; only && i < 6 && next[only]?.id === outfit[only]?.id; i++) next = shuffleOutfit(pieces, keep);
    const changed = SLOTS.filter((s) => next[s]?.id !== outfit[s]?.id);
    setError(null);

    const leaving = changed.filter((s) => outfit[s]).map((s) => `[data-slot="${s}"] .card-face`).join(",");
    const swap = () => {
      setOutfit(next);
      setFresh((f) => ({ slots: changed, roll: f.roll + 1 }));
      setBusy(false);
    };
    if (!leaving || reducedMotion()) return swap();
    setBusy(true);
    gsap.to(scope.current!.querySelectorAll(leaving), {
      rotationY: 90,
      scale: 0.9,
      opacity: 0,
      transformPerspective: 900,
      duration: 0.28,
      ease: "power2.in",
      stagger: 0.04,
      onComplete: swap,
    });
  }

  const shown = SLOTS.filter((s) => outfit[s]);
  const chosen = shown.map((s) => outfit[s]!);

  function save(thenCanvas: boolean) {
    startSaving(async () => {
      const result = await saveLook({ name: "Dress Me look", source: "shuffle", layout: flatLayLayout(chosen) });
      if (result.error || !result.id) return setError(result.error ?? "Couldn't save the look");
      router.push(thenCanvas ? `/looks/${result.id}` : "/looks");
    });
  }

  return (
    <div className="space-y-6">
      <BackLink href="/looks">Looks</BackLink>
      <div className="rise">
        <h1 className="text-2xl font-semibold tracking-tight">Dress Me</h1>
        <p className="mt-1 text-sm text-muted">A random outfit from your wardrobe. Lock what you love, shuffle the rest.</p>
      </div>

      {pieces.length < 2 ? (
        <EmptyCard title="Not enough to shuffle yet" body="Log an outfit or two so there are pieces to mix." />
      ) : (
        <>
          <div ref={scope} className="grid grid-cols-2 gap-3 [perspective:1100px]">
            {shown.map((slot) => {
              const piece = outfit[slot]!;
              const isLocked = Boolean(locked[slot]);
              return (
                <div key={slot} data-slot={slot} className={slot === "dress" ? "col-span-2" : ""}>
                  <div
                    className={`card-face relative rounded-3xl bg-surface p-3 shadow-[0_18px_40px_-24px_rgba(80,60,120,0.45)] ring-2 transition-[box-shadow] ${
                      isLocked ? "ring-accent" : "ring-transparent"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => shuffle(slot)}
                      disabled={busy || isLocked}
                      aria-label={`Swap the ${piece.name}`}
                      className={`block w-full ${slot === "dress" ? "aspect-[4/3]" : "aspect-square"} disabled:cursor-default`}
                    >
                      <PieceArt piece={piece} />
                    </button>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted">{CATEGORY_LABELS[slot]}</p>
                        <p className="truncate text-sm font-medium">{piece.name}</p>
                      </div>
                      <button
                        type="button"
                        aria-pressed={isLocked}
                        aria-label={isLocked ? `Unlock ${piece.name}` : `Lock ${piece.name}`}
                        onClick={() => setLocked((l) => ({ ...l, [slot]: isLocked ? undefined : true }))}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                          isLocked ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted"
                        }`}
                      >
                        <LockIcon open={!isLocked} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-muted">Tap a piece to swap just that one.</p>

          {error && (
            <p className="rounded-2xl bg-danger/10 p-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <button type="button" onClick={() => shuffle()} disabled={busy} className={`${primaryButton} w-full`}>
            <ShuffleIcon />
            Shuffle
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={saving || !chosen.length} onClick={() => save(false)} className={secondaryButton}>
              {saving && <Spinner />}
              Save look
            </button>
            <button type="button" disabled={saving || !chosen.length} onClick={() => save(true)} className={secondaryButton}>
              Arrange on canvas
            </button>
          </div>
          <p className="text-center text-sm">
            <Link href="/today" className="font-medium text-accent-strong">
              Want it picked for the weather? Try Today →
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function LockIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d={open ? "M8 11V8a4 4 0 0 1 7.5-2" : "M8 11V8a4 4 0 0 1 8 0v3"} />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6C14.3 16 15.5 17 17.5 17H21M3 17h3.5c1.4 0 2.4-.5 3.2-1.3M14.3 8.3c.8-.8 1.8-1.3 3.2-1.3H21M18 4l3 3-3 3M18 14l3 3-3 3" />
    </svg>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  photoUrl: string | undefined;
  lookUrl: string | undefined;
  lookStatus: "pending" | "done" | "failed" | null | undefined;
};

const POLL_MS = 4000;
const GIVE_UP_AFTER = 45; // polls, about three minutes

/**
 * The outfit in the arched mirror: the clean look (with a switch back to the
 * photo). If the look is still being finished, it quietly shows the photo and
 * swaps the look in when it's ready.
 */
export function OutfitViewer({ photoUrl, lookUrl, lookStatus }: Props) {
  const router = useRouter();
  const [view, setView] = useState<"look" | "photo">("look");
  const pending = lookStatus === "pending" && !lookUrl;

  // Re-fetch the page until the look arrives.
  useEffect(() => {
    if (!pending) return;
    let polls = 0;
    const timer = setInterval(() => {
      if (++polls > GIVE_UP_AFTER) clearInterval(timer);
      else router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, router]);

  const showLook = Boolean(lookUrl) && view === "look";

  return (
    <div className="space-y-3">
      <div className="mirror relative aspect-[3/4] bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={showLook ? "look" : "photo"}
          src={showLook ? lookUrl : photoUrl}
          alt={showLook ? "Your outfit, laid out on its own" : "Outfit photo"}
          className={`view-in h-full w-full ${showLook ? "object-contain p-[8%] drop-shadow-[0_18px_22px_rgba(43,30,23,0.2)]" : "object-cover"}`}
        />
      </div>

      {lookUrl && (
        <div className="mx-auto flex w-fit gap-1 rounded-full bg-surface p-1" role="tablist" aria-label="Outfit view">
          {(["look", "photo"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${view === v ? "bg-foreground text-background" : "text-muted"}`}
            >
              {v === "look" ? "Clean look" : "Photo"}
            </button>
          ))}
        </div>
      )}
      {lookStatus === "failed" && !lookUrl && (
        <p className="text-center text-sm text-muted">The clean picture couldn&apos;t be drawn. Re-scan the photo to try again.</p>
      )}
    </div>
  );
}

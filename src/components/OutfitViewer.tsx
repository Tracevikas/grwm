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
 * The outfit in the arched mirror: the clean ChatGPT look when it's ready
 * (with a switch back to the photo), or the photo while it's being made.
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
        {pending && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 pt-16 text-white" role="status">
            <div className="shimmer mx-auto mb-3 h-1 w-24 overflow-hidden rounded-full bg-white/25" />
            <p className="text-center text-sm font-semibold">ChatGPT is laying out your look…</p>
            <p className="text-center text-xs text-white/75">Takes about half a minute. You can leave this page.</p>
          </div>
        )}
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
        <p className="text-center text-sm text-muted">ChatGPT couldn&apos;t draw this look. Re-scan the photo to try again.</p>
      )}
    </div>
  );
}

"use client";

import { useLinkStatus } from "next/link";
import { Spinner } from "./Spinner";

/**
 * Put inside a <Link>: while that navigation is waiting on the server, covers
 * the link with a soft veil and a spinner so the tap visibly registered.
 */
export function LinkPending({ className = "rounded-[inherit]" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`absolute inset-0 z-10 flex items-center justify-center bg-background/45 backdrop-blur-[1px] ${className}`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-foreground shadow-md">
        <Spinner />
      </span>
    </span>
  );
}

/** Small inline variant for text links and nav tabs. */
export function LinkPendingDot() {
  const { pending } = useLinkStatus();
  return pending ? <Spinner className="h-3.5 w-3.5" /> : null;
}

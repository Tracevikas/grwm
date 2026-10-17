"use client";

import { useActionState } from "react";
import type { CutoutState } from "@/app/(app)/actions";

type Props = {
  action: (prev: CutoutState) => Promise<CutoutState>;
  hasCutout: boolean;
};

export function CutoutButton({ action, hasCutout }: Props) {
  const [state, run, pending] = useActionState(action, {});

  return (
    <form action={run} className="space-y-2 text-center">
      <button
        disabled={pending}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-surface px-5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="6" cy="18" r="2.5" />
          <path d="M8 7.5 20 17M8 16.5 20 7" />
        </svg>
        {pending ? "Cutting out…" : hasCutout ? "Redo cut-out" : "Cut out background"}
      </button>
      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

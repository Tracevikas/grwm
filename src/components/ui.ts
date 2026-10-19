/** Shared class strings so chips and buttons look the same on every page. */

export function chipClass(active: boolean) {
  return `shrink-0 rounded-full px-4 py-2 text-sm font-medium capitalize transition active:scale-95 ${
    active ? "bg-accent text-accent-ink shadow-sm shadow-accent/30" : "bg-surface text-foreground hover:bg-surface-2"
  }`;
}

export const primaryButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 font-semibold text-accent-ink shadow-sm shadow-accent/30 transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60";

export const secondaryButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-surface px-5 font-semibold transition hover:bg-surface-2 active:scale-[0.98] disabled:opacity-60";

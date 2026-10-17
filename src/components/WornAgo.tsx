"use client";

/**
 * "worn 3 days ago", computed in the browser so "today" is the viewer's own
 * date (and so the server never reads the current time while prerendering).
 */
export function WornAgo({ date }: { date: string | null }) {
  return <span suppressHydrationWarning>{wornAgo(date)}</span>;
}

export function wornAgo(iso: string | null, now = new Date()) {
  if (!iso) return "never worn";
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const then = new Date(`${iso}T00:00:00`);
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "worn today";
  if (days === 1) return "worn yesterday";
  return `worn ${days} days ago`;
}

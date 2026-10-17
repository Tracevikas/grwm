import { initials } from "@/lib/profile";

/** Profile photo (from Google) or initials on butter. */
export function Avatar({ name, url, className = "h-10 w-10 text-sm" }: { name: string; url: string | null; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" referrerPolicy="no-referrer" className={`shrink-0 rounded-full object-cover ring-2 ring-surface ${className}`} />
  ) : (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-ink ${className}`}>
      {initials(name)}
    </span>
  );
}

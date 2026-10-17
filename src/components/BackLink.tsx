import Link from "next/link";
import { LinkPendingDot } from "./LinkPending";

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      transitionTypes={["nav-back"]}
      className="-ml-2 inline-flex items-center gap-1 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-medium text-muted transition hover:bg-surface hover:text-foreground active:scale-95"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m15 18-6-6 6-6" />
      </svg>
      {children}
      <LinkPendingDot />
    </Link>
  );
}

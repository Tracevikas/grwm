"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { LinkPendingDot } from "./LinkPending";

const tabs = [
  {
    href: "/",
    label: "Wardrobe",
    // Hanger
    icon: "M12 7.5a2 2 0 1 1 2-2M12 7.5v1.2L3.6 14.4c-.9.6-.5 2 .6 2h15.6c1.1 0 1.5-1.4.6-2L12 8.7",
  },
  {
    href: "/log",
    label: "Log outfit",
    // Plus in a circle
    icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8v8M8 12h8",
  },
  {
    href: "/outfits",
    label: "Diary",
    // Calendar
    icon: "M5 6h14v13H5zM5 10h14M9 4v4M15 4v4",
  },
];

function isActive(href: string, pathname: string | null) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" || pathname.startsWith("/items") : pathname.startsWith(href);
}

function Nav({ pathname }: { pathname: string | null }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)]"
      style={{ viewTransitionName: "bottom-nav" }}
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around">
        {tabs.map((tab) => {
          const active = isActive(tab.href, pathname);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                transitionTypes={["nav-tab"]}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition active:scale-95 ${
                  active ? "text-accent-strong" : "text-muted hover:text-foreground"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={tab.icon} />
                </svg>
                <span className="flex items-center gap-1">
                  {tab.label}
                  <LinkPendingDot />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NavWithPath() {
  return <Nav pathname={usePathname()} />;
}

export function BottomNav() {
  // The pathname is only known at request time, so stream the active state in.
  return (
    <Suspense fallback={<Nav pathname={null} />}>
      <NavWithPath />
    </Suspense>
  );
}

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
  { href: "/log", label: "Log outfit", icon: "M12 5v14M5 12h14", primary: true },
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
      className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{ viewTransitionName: "bottom-nav" }}
    >
      <ul className="flex items-center gap-1 rounded-full bg-nav p-1.5 text-nav-ink shadow-[0_12px_32px_-12px_rgba(43,30,23,0.55)]">
        {tabs.map((tab) => {
          const active = isActive(tab.href, pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                transitionTypes={["nav-tab"]}
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                className={
                  tab.primary
                    ? "mx-1 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-ink transition active:scale-90"
                    : `flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all duration-300 active:scale-95 ${
                        active ? "bg-nav-ink text-nav" : "opacity-70 hover:opacity-100"
                      }`
                }
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={tab.primary ? 2.6 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={tab.icon} />
                </svg>
                {!tab.primary && active && <span className="rise">{tab.label}</span>}
                {!tab.primary && <LinkPendingDot />}
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

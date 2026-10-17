import { Suspense, ViewTransition } from "react";

/** Direction a page arrives from, keyed by the transition type on the Link that opened it. */
const DIRECTIONAL = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  "nav-tab": "tab-fade",
  default: "none",
};

/**
 * Wraps a page's content: slides in by navigation direction, and hands off
 * from its loading skeleton with a slide-up. Each page owns its Suspense
 * boundary (layout-level loading.tsx can't cover navigations within (app)).
 */
export function PageShell({ fallback, children }: { fallback: React.ReactNode; children: React.ReactNode }) {
  return (
    <ViewTransition enter={DIRECTIONAL} exit={DIRECTIONAL} default="none">
      <Suspense
        fallback={
          <ViewTransition exit="slide-down" default="none">
            {fallback}
          </ViewTransition>
        }
      >
        <ViewTransition enter="slide-up" default="none">
          {children}
        </ViewTransition>
      </Suspense>
    </ViewTransition>
  );
}

/** For pages without async content (e.g. Log outfit): directional entry only. */
export function DirectionalPage({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={DIRECTIONAL} exit={DIRECTIONAL} default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}

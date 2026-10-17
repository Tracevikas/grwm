"use client";

import { useLayoutEffect, useRef } from "react";

/** Renders `value`, counting up to it once on mount (instantly with reduced motion). */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  // Before paint, so the final number never flashes before the count starts.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = String(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    el.textContent = "0";
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = String(value);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {value}
    </span>
  );
}

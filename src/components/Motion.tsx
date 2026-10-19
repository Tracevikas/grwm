"use client";

import { useRef } from "react";
import { gsap, reducedMotion, ScrollTrigger, useGSAP } from "@/lib/gsap";

/** Leans its content toward the pointer in 3D, like a card held up to the light. Mouse/pen only. */
export function Tilt({ children, className = "", max = 9 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || reducedMotion() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      gsap.set(el, { transformPerspective: 800, transformStyle: "preserve-3d" });
      const rx = gsap.quickTo(el, "rotationX", { duration: 0.5, ease: "power3.out" });
      const ry = gsap.quickTo(el, "rotationY", { duration: 0.5, ease: "power3.out" });
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 2 * max);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 2 * max);
      };
      const leave = () => {
        rx(0);
        ry(0);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      return () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", leave);
      };
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Children marked `.reveal` rise and untilt into place as they scroll into view. */
export function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (reducedMotion()) return;
      const items = gsap.utils.toArray<HTMLElement>(".reveal", ref.current);
      gsap.set(items, { opacity: 0, y: 40, rotationX: 18, transformPerspective: 900, transformOrigin: "50% 100%" });
      ScrollTrigger.batch(items, {
        start: "top 92%",
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { opacity: 1, y: 0, rotationX: 0, duration: 0.7, ease: "power3.out", stagger: 0.08, clearProps: "transform" }),
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export { gsap, ScrollTrigger, useGSAP };

/** Motion is decoration here: with reduced motion, things just appear. */
export function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Pieces land on the board like cards tossed onto a table: tilted in 3D, then settling. */
export function dealIn(targets: gsap.TweenTarget, opts: { stagger?: number; delay?: number } = {}) {
  if (reducedMotion()) return gsap.set(targets, { opacity: 1 });
  return gsap.fromTo(
    targets,
    { opacity: 0, y: -60, scale: 0.55, rotationX: -55, rotationY: 25, transformPerspective: 900 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      rotationX: 0,
      rotationY: 0,
      duration: 0.75,
      ease: "back.out(1.5)",
      stagger: opts.stagger ?? 0.08,
      delay: opts.delay ?? 0,
      clearProps: "transform",
    },
  );
}

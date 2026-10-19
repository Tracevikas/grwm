"use client";

import { useRef } from "react";
import { gsap, reducedMotion, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { Wordmark } from "../Wordmark";

const CHAPTERS = [
  {
    kicker: "01 · Snap",
    title: "One mirror photo. Every piece saved.",
    body: "Take a photo of what you're wearing. AI finds each piece, cuts it out and adds it to your wardrobe, deduplicated.",
  },
  {
    kicker: "02 · Today",
    title: "Your outfit, picked for the weather and your mood.",
    body: "Live local weather, how you feel and what's on: the stylist builds a look from clothes you actually own.",
  },
  {
    kicker: "03 · Dress Me",
    title: "Shuffle, lock what you love, shuffle again.",
    body: "Random outfits dealt like cards. Keep the jeans, re-roll the rest until it clicks.",
  },
  {
    kicker: "04 · Canvas & calendar",
    title: "Lay it out. Plan the week.",
    body: "Drag pieces into a flat-lay, then pin looks to days so mornings take seconds.",
  },
  {
    kicker: "05 · Cost per wear",
    title: "See what's worth it.",
    body: "Add what you paid and watch each piece's cost per wear drop every time you wear it.",
  },
];

/**
 * The public landing: a 3D scene behind scroll-told chapters, ending at sign-in.
 * Three.js loads after first paint, so the page is usable before the scene appears.
 */
export function Landing({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useGSAP(
    () => {
      const still = reducedMotion();
      let controls: import("./scene").SceneControls | undefined;
      let cancelled = false;

      // WebGL can be missing (old devices, some privacy modes): the page still works without it.
      import("./scene")
        .then(({ createScene }) => {
          if (cancelled || !canvas.current) return;
          try {
            controls = createScene(canvas.current, { animate: !still });
          } catch {
            return;
          }
          gsap.fromTo(canvas.current, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: still ? 0 : 1.4, ease: "power2.out" });
          ScrollTrigger.create({
            trigger: root.current,
            start: "top top",
            end: "bottom bottom",
            scrub: still ? true : 1.2,
            onUpdate: (self) => controls?.setProgress(self.progress),
          });
        })
        .catch(() => {});

      const onPointer = (e: PointerEvent) => controls?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      window.addEventListener("pointermove", onPointer);

      if (!still) {
        // Headline letters rise in, tilted back in 3D.
        gsap.from(".hero-char", { yPercent: 110, rotationX: -80, opacity: 0, transformPerspective: 600, stagger: 0.035, duration: 0.9, ease: "back.out(1.4)", delay: 0.15 });
        gsap.from(".hero-fade", { opacity: 0, y: 20, duration: 0.8, stagger: 0.12, delay: 0.7, ease: "power2.out" });

        // Each chapter card swings up out of the page as it scrolls in, and its kicker line draws across.
        gsap.utils.toArray<HTMLElement>(".chapter").forEach((el) => {
          gsap
            .timeline({ scrollTrigger: { trigger: el, start: "top 80%", end: "top 35%", scrub: 0.8 } })
            .from(el, { opacity: 0, y: 90, rotationX: 28, rotationY: el.dataset.side === "right" ? -14 : 14, transformPerspective: 1100, ease: "power2.out" })
            .from(el.querySelector(".chapter-line"), { scaleX: 0, transformOrigin: "left center", ease: "none" }, 0.2);
        });

        gsap.from(".signin-card", {
          scrollTrigger: { trigger: ".signin-card", start: "top 85%" },
          opacity: 0,
          y: 60,
          scale: 0.96,
          duration: 0.8,
          ease: "power3.out",
        });
      }

      return () => {
        cancelled = true;
        window.removeEventListener("pointermove", onPointer);
        controls?.dispose();
      };
    },
    { scope: root },
  );

  return (
    <div ref={root} className="relative overflow-x-clip">
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-0 h-dvh w-full opacity-0" aria-hidden />

      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-5 py-4">
        <Wordmark className="text-lg" />
        <a href="#signin" className="rounded-full bg-surface px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-surface-2 active:scale-95">
          Sign in
        </a>
      </header>

      <section className="relative z-10 flex min-h-dvh flex-col items-center justify-end px-6 pb-[14vh] text-center">
        <h1 className="display text-[clamp(3.2rem,15vw,8rem)] font-extrabold leading-[0.9]" aria-label="get ready with me">
          {["get ready", "with me"].map((line) => (
            <span key={line} className="block overflow-hidden pb-[0.06em]" aria-hidden>
              {[...line].map((ch, i) => (
                <span key={i} className="hero-char inline-block bg-gradient-to-br from-[#9c80d8] to-[#e58fb6] bg-clip-text text-transparent">
                  {ch === " " ? " " : ch}
                </span>
              ))}
            </span>
          ))}
        </h1>
        <p className="hero-fade mt-5 max-w-md text-[1.05rem] leading-relaxed text-muted">
          Your whole wardrobe, remembered. Snap today&apos;s outfit and plan tomorrow&apos;s without opening the closet.
        </p>
        <div className="hero-fade mt-7 flex gap-3">
          <a href="#signin" className="inline-flex h-12 items-center rounded-full bg-accent px-6 font-semibold text-accent-ink shadow-lg shadow-accent/30 transition hover:opacity-90 active:scale-95">
            Get started free
          </a>
          <a href="#features" className="inline-flex h-12 items-center rounded-full bg-surface px-6 font-semibold transition hover:bg-surface-2 active:scale-95">
            See how
          </a>
        </div>
        <span className="hero-fade mt-10 text-xs font-medium uppercase tracking-[0.2em] text-muted">Scroll</span>
      </section>

      <div id="features" className="relative z-10 mx-auto max-w-5xl space-y-[28vh] px-5 py-[20vh]">
        {CHAPTERS.map((c, i) => {
          const side = i % 2 ? "right" : "left";
          return (
            <article
              key={c.kicker}
              data-side={side}
              className={`chapter max-w-md rounded-[2rem] bg-surface p-7 shadow-[0_30px_60px_-30px_rgba(80,60,120,0.35)] ${side === "right" ? "md:ml-auto" : ""}`}
            >
              <p className="text-sm font-semibold text-accent-strong">{c.kicker}</p>
              <span className="chapter-line mt-3 block h-0.5 w-16 rounded-full bg-accent" />
              <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-tight">{c.title}</h2>
              <p className="mt-3 leading-relaxed text-muted">{c.body}</p>
            </article>
          );
        })}
      </div>

      <section id="signin" className="relative z-10 flex min-h-dvh items-center justify-center px-5 py-24">
        <div className="signin-card w-full max-w-sm rounded-[2rem] bg-surface/90 p-6 shadow-[0_30px_70px_-30px_rgba(80,60,120,0.45)]">
          <h2 className="text-2xl font-semibold tracking-tight">Start your wardrobe</h2>
          <p className="mt-1 text-sm text-muted">Free. Sign in with Google or an email link.</p>
          {children}
        </div>
      </section>
    </div>
  );
}

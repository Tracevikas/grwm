"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { gsap, reducedMotion } from "@/lib/gsap";

export type PlannedLook = { id: string; name: string; date: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const noop = () => () => {};
const localToday = () => new Date().toLocaleDateString("en-CA");

/** A month of days: planned looks as gradient dots, logged outfits as soft rings. */
export function LooksCalendar({ planned, worn }: { planned: PlannedLook[]; worn: string[] }) {
  // "Today" is the viewer's local day, so it's only known in the browser.
  const todayIso = useSyncExternalStore(noop, localToday, () => null);
  const [chosenMonth, setMonth] = useState<{ y: number; m: number } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, PlannedLook[]>();
    for (const p of planned) map.set(p.date, [...(map.get(p.date) ?? []), p]);
    return map;
  }, [planned]);
  const wornSet = useMemo(() => new Set(worn), [worn]);

  if (!todayIso) return <section className="skeleton h-[22rem] rounded-3xl" aria-label="Looks calendar" />;
  const month = chosenMonth ?? { y: Number(todayIso.slice(0, 4)), m: Number(todayIso.slice(5, 7)) - 1 };

  const first = new Date(month.y, month.m, 1);
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // weeks start on Monday
  const label = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  /** Pages the month with a short 3D turn. */
  function go(delta: number) {
    const turn = () => {
      const { y, m } = month;
      setMonth({ y: m + delta < 0 ? y - 1 : m + delta > 11 ? y + 1 : y, m: (m + delta + 12) % 12 });
      setPicked(null);
    };
    if (reducedMotion() || !grid.current) return turn();
    gsap.to(grid.current, {
      rotationY: -delta * 70,
      opacity: 0,
      transformPerspective: 900,
      duration: 0.18,
      ease: "power2.in",
      onComplete: () => {
        turn();
        gsap.fromTo(grid.current, { rotationY: delta * 70, opacity: 0 }, { rotationY: 0, opacity: 1, duration: 0.3, ease: "power2.out" });
      },
    });
  }

  const pickedLooks = picked ? (byDate.get(picked) ?? []) : [];

  return (
    <section className="rounded-3xl bg-surface p-4" aria-label="Looks calendar">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{label}</h2>
        <div className="flex gap-1">
          <button type="button" aria-label="Previous month" onClick={() => go(-1)} className="h-9 w-9 rounded-full bg-surface-2 active:scale-90">
            ‹
          </button>
          <button type="button" aria-label="Next month" onClick={() => go(1)} className="h-9 w-9 rounded-full bg-surface-2 active:scale-90">
            ›
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-medium text-muted" aria-hidden>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div ref={grid} className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = iso(month.y, month.m, i + 1);
          const has = byDate.has(date);
          const wasWorn = wornSet.has(date);
          return (
            <button
              key={date}
              type="button"
              onClick={() => setPicked(picked === date ? null : date)}
              aria-label={`${date}${has ? ", look planned" : ""}${wasWorn ? ", outfit logged" : ""}`}
              aria-pressed={picked === date}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm tabular-nums transition active:scale-90 ${
                picked === date ? "bg-accent text-accent-ink" : date === todayIso ? "bg-accent/10 font-semibold text-accent-strong" : "hover:bg-surface-2"
              } ${wasWorn && picked !== date ? "ring-1 ring-accent/50" : ""}`}
            >
              {i + 1}
              {has && <span className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${picked === date ? "bg-white" : "bg-accent"}`} />}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Planned look
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-md ring-1 ring-accent/50" /> Outfit logged
        </span>
      </div>

      {picked && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {pickedLooks.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing planned.{" "}
              <Link href="/looks/new" className="font-medium text-accent-strong">
                Make a look →
              </Link>
            </p>
          ) : (
            pickedLooks.map((l) => (
              <Link key={l.id} href={`/looks/${l.id}`} transitionTypes={["nav-forward"]} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium">
                {l.name}
                <span className="text-muted">→</span>
              </Link>
            ))
          )}
        </div>
      )}
    </section>
  );
}

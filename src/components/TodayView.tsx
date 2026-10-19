"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { saveLook } from "@/app/(app)/looks/actions";
import { dealIn, gsap, reducedMotion, useGSAP } from "@/lib/gsap";
import { flatLayLayout } from "@/lib/looks";
import { MOODS, OCCASIONS, type Mood, type Occasion, type TodayPick } from "@/lib/today";
import { CONDITION_LABELS, CONDITIONS, DEFAULT_WEATHER, feelOf, fetchWeather, type Condition, type Weather } from "@/lib/weather";
import { LookBoard, type BoardPiece } from "./LookBoard";
import { Spinner } from "./Spinner";
import { chipClass, primaryButton, secondaryButton } from "./ui";

type WeatherState = { weather: Weather; source: "locating" | "live" | "default" | "manual" };

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
const noop = () => () => {};
const canLocate = () => "geolocation" in navigator;

export function TodayView({ pieces }: { pieces: BoardPiece[] }) {
  const router = useRouter();
  const byId = useMemo(() => Object.fromEntries(pieces.map((p) => [p.id, p])), [pieces]);
  const [wx, setWx] = useState<WeatherState>({ weather: DEFAULT_WEATHER, source: "locating" });
  const hasGeo = useSyncExternalStore(noop, canLocate, () => true);
  const [mood, setMood] = useState<Mood>("relaxed");
  const [occasion, setOccasion] = useState<Occasion>("everyday");
  const [pick, setPick] = useState<TodayPick | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [styling, setStyling] = useState(false);
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Live weather from the browser's location; falls back to a mild default.
  useEffect(() => {
    if (!canLocate()) return;
    const ctrl = new AbortController();
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const weather = await fetchWeather(coords.latitude, coords.longitude, ctrl.signal);
          setWx((w) => (w.source === "manual" ? w : { weather, source: "live" }));
        } catch {
          setWx((w) => (w.source === "locating" ? { ...w, source: "default" } : w));
        }
      },
      () => setWx((w) => (w.source === "locating" ? { ...w, source: "default" } : w)),
      { timeout: 8000, maximumAge: 30 * 60 * 1000 },
    );
    return () => ctrl.abort();
  }, []);

  const setWeather = (next: Partial<Weather>) => setWx((w) => ({ weather: { ...w.weather, ...next }, source: "manual" }));

  async function style(avoid?: string[]) {
    setStyling(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weather: wx.weather, mood, occasion, avoid, today: today() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");
      setPick(body as TodayPick);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setStyling(false);
    }
  }

  const chosen = useMemo(() => (pick?.item_ids ?? []).map((id) => byId[id]).filter(Boolean), [pick, byId]);
  const layout = useMemo(() => flatLayLayout(chosen), [chosen]);

  // Each new pick deals its pieces onto the board; the reason card slides up after.
  useGSAP(
    () => {
      if (!pick) return;
      dealIn(".today-piece", { stagger: 0.1 });
      if (!reducedMotion()) gsap.from(".today-reason", { opacity: 0, y: 16, duration: 0.5, delay: 0.35, ease: "power2.out" });
    },
    { scope: boardRef, dependencies: [pick] },
  );

  function save(plan: boolean) {
    if (!pick) return;
    startSaving(async () => {
      const result = await saveLook({
        name: pick.title,
        source: "today",
        layout,
        note: pick.reason,
        planned_for: plan ? today() : null,
      });
      if (result.error) setError(result.error);
      else if (result.id) setSaved(result.id);
    });
  }

  async function editOnCanvas() {
    if (!pick) return;
    const result = saved ? { id: saved } : await saveLook({ name: pick.title, source: "today", layout, note: pick.reason });
    if (result.id) router.push(`/looks/${result.id}`);
    else setError(("error" in result && result.error) || "Couldn't open the canvas");
  }

  if (pieces.length < 2) {
    return (
      <div className="space-y-6">
        <Header />
        <EmptyCard
          title="Add a few more pieces"
          body="The stylist needs at least a couple of items to build a full outfit. Log an outfit and come back."
        />
      </div>
    );
  }

  const { weather } = wx;
  const source = wx.source === "locating" && !hasGeo ? "default" : wx.source;

  return (
    <div className="space-y-6">
      <Header />

      <section className="rise rounded-3xl bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-semibold tabular-nums">
              {weather.tempC}°C · {feelOf(weather.tempC)}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {source === "locating" && "Checking your local weather…"}
              {source === "live" && "Live weather where you are"}
              {source === "manual" && "Set by you"}
              {source === "default" && "Using a default · set it below"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Colder" onClick={() => setWeather({ tempC: weather.tempC - 2 })} className="h-9 w-9 rounded-full bg-surface-2 text-lg font-semibold active:scale-90">
              −
            </button>
            <button type="button" aria-label="Warmer" onClick={() => setWeather({ tempC: weather.tempC + 2 })} className="h-9 w-9 rounded-full bg-surface-2 text-lg font-semibold active:scale-90">
              +
            </button>
          </div>
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4" role="radiogroup" aria-label="Weather">
          {CONDITIONS.map((c: Condition) => (
            <button key={c} type="button" role="radio" aria-checked={weather.condition === c} onClick={() => setWeather({ condition: c })} className={chipClass(weather.condition === c)}>
              {CONDITION_LABELS[c]}
            </button>
          ))}
        </div>
      </section>

      <ChipRow label="How do you feel today?" options={MOODS} value={mood} onChange={setMood} />
      <ChipRow label="What's the plan?" options={OCCASIONS} value={occasion} onChange={setOccasion} />

      <button type="button" disabled={styling} onClick={() => style()} className={`${primaryButton} w-full`}>
        {styling ? <Spinner /> : <Sparkle />}
        {styling ? "Styling your look…" : pick ? "Style me again" : "Style me"}
      </button>

      {error && (
        <p className="rounded-2xl bg-danger/10 p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div ref={boardRef} className="space-y-4">
        {pick && (
          <>
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-lg font-semibold">{pick.title}</h2>
              <span className="text-sm text-muted">{chosen.length} pieces</span>
            </div>
            <div className="[perspective:1000px]">
              <LookBoard layout={layout} pieces={byId} pieceClassName="today-piece" className={styling ? "opacity-50 transition" : "transition"} />
            </div>
            <p className="today-reason rounded-2xl bg-surface p-4 text-[0.95rem] leading-relaxed">{pick.reason}</p>
            <ul className="flex flex-wrap gap-1.5">
              {chosen.map((p) => (
                <li key={p.id}>
                  <Link href={`/items/${p.id}`} transitionTypes={["nav-forward"]} className="inline-block rounded-full bg-surface px-3 py-1.5 text-sm hover:bg-surface-2">
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>

            {saved ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-accent/10 p-4 text-sm">
                <span className="font-medium">Saved to your looks.</span>
                <Link href={`/looks/${saved}`} className="font-semibold text-accent-strong">
                  Open look →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={saving} onClick={() => save(true)} className={primaryButton}>
                  {saving && <Spinner />}
                  Wear it today
                </button>
                <button type="button" disabled={saving} onClick={() => save(false)} className={secondaryButton}>
                  Save look
                </button>
              </div>
            )}
            <div className="flex justify-center gap-5 text-sm font-medium">
              <button type="button" disabled={styling} onClick={() => style(pick.item_ids)} className="text-muted hover:text-foreground">
                Show me something else
              </button>
              <button type="button" onClick={editOnCanvas} className="text-muted hover:text-foreground">
                Tweak on canvas
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="rise">
      <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
      <p className="mt-1 text-sm text-muted">A look picked from your wardrobe for the weather and your mood.</p>
    </div>
  );
}

function ChipRow<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <section className="space-y-2" aria-label={label}>
      <p className="text-sm font-medium">{label}</p>
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={chipClass(value === o)}>
            {o}
          </button>
        ))}
      </div>
    </section>
  );
}

export function EmptyCard({ title, body, href = "/log", cta = "Log an outfit" }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      <Link href={href} className={`${primaryButton} mt-6 h-11 px-5 text-sm`}>
        {cta}
      </Link>
    </div>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M12 2.5 13.9 9 20.5 11l-6.6 2L12 19.5 10.1 13 3.5 11l6.6-2zM19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </svg>
  );
}

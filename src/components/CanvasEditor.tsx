"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { saveLook, updateLook } from "@/app/(app)/looks/actions";
import { dealIn, gsap, reducedMotion } from "@/lib/gsap";
import { flatLayLayout } from "@/lib/looks";
import { CATEGORIES, CATEGORY_LABELS, type Category, type Look, type Placement } from "@/lib/types";
import { PieceArt, placementStyle, type BoardPiece } from "./LookBoard";
import { Spinner } from "./Spinner";
import { chipClass, primaryButton, secondaryButton } from "./ui";

type Props = {
  pieces: BoardPiece[];
  /** Editing a saved look; omitted for a new one. */
  look?: Pick<Look, "id" | "name" | "layout" | "planned_for" | "note">;
};

type Drag = { id: string; pointer: number; startX: number; startY: number; fromX: number; fromY: number };

export function CanvasEditor({ pieces, look }: Props) {
  const router = useRouter();
  const byId = useMemo(() => Object.fromEntries(pieces.map((p) => [p.id, p])), [pieces]);
  const [name, setName] = useState(look?.name ?? "");
  const [plannedFor, setPlannedFor] = useState(look?.planned_for ?? "");
  const [layout, setLayout] = useState<Placement[]>(() => (look?.layout ?? []).filter((p) => byId[p.item_id]));
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Category | null>(null);
  const [status, setStatus] = useState<{ error?: string; saved?: boolean }>({});
  const [saving, startSaving] = useTransition();
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const onBoard = new Set(layout.map((p) => p.item_id));
  const sel = layout.find((p) => p.item_id === selected);
  const tray = pieces.filter((p) => !filter || p.category === filter);
  const categories = CATEGORIES.filter((c) => pieces.some((p) => p.category === c));

  const patch = (id: string, next: Partial<Placement>) => {
    setStatus({});
    setLayout((l) => l.map((p) => (p.item_id === id ? { ...p, ...next } : p)));
  };

  function toggle(piece: BoardPiece) {
    setStatus({});
    if (onBoard.has(piece.id)) {
      setLayout((l) => l.filter((p) => p.item_id !== piece.id));
      if (selected === piece.id) setSelected(null);
      return;
    }
    // New pieces land in their flat-lay spot, nudged past any of the same kind.
    const sameKind = layout.filter((p) => byId[p.item_id]?.category === piece.category).length;
    const spot = flatLayLayout([...Array(sameKind).fill({ id: "_", category: piece.category }), piece]).at(-1)!;
    setLayout((l) => [...l, spot]);
    setSelected(piece.id);
    requestAnimationFrame(() => dealIn(board.current?.querySelector(`[data-piece="${piece.id}"] .piece-inner`) ?? [], {}));
  }

  /** Tidies everything into a flat-lay, gliding each piece to its new spot. */
  function autoArrange() {
    const target = flatLayLayout(layout.map((p) => byId[p.item_id]));
    if (reducedMotion()) return setLayout(target);
    const live = layout.map((p) => ({ ...p }));
    gsap.to(live, {
      x: (i) => target[i].x,
      y: (i) => target[i].y,
      scale: (i) => target[i].scale,
      rotate: (i) => target[i].rotate,
      duration: 0.6,
      ease: "power3.inOut",
      onUpdate: () => setLayout(live.map((p) => ({ ...p }))),
    });
  }

  function bringToFront(id: string) {
    setLayout((l) => [...l.filter((p) => p.item_id !== id), l.find((p) => p.item_id === id)!]);
  }

  function onPointerDown(e: React.PointerEvent, p: Placement) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(p.item_id);
    drag.current = { id: p.item_id, pointer: e.pointerId, startX: e.clientX, startY: e.clientY, fromX: p.x, fromY: p.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const rect = board.current?.getBoundingClientRect();
    if (!d || d.pointer !== e.pointerId || !rect) return;
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    patch(d.id, {
      x: clamp(d.fromX + (e.clientX - d.startX) / rect.width),
      y: clamp(d.fromY + (e.clientY - d.startY) / rect.height),
    });
  }

  function save() {
    startSaving(async () => {
      const fields = { name, layout, planned_for: plannedFor || null };
      if (look) {
        const result = await updateLook(look.id, fields);
        setStatus(result.error ? { error: result.error } : { saved: true });
      } else {
        const result = await saveLook({ ...fields, source: "canvas" });
        if (result.error || !result.id) return setStatus({ error: result.error ?? "Couldn't save the look" });
        router.replace(`/looks/${result.id}`);
      }
    });
  }

  return (
    <div className="space-y-4">
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setStatus({});
        }}
        placeholder="Name this look"
        aria-label="Look name"
        maxLength={80}
        className="h-12 w-full rounded-2xl bg-surface px-4 text-lg font-semibold outline-none placeholder:font-normal placeholder:text-muted focus:ring-2 focus:ring-accent-strong"
      />

      {/* The board: drag to move; the selected piece gets the toolbar below. */}
      <div
        ref={board}
        className="relative aspect-[4/5] touch-none select-none overflow-hidden rounded-3xl bg-surface [perspective:1000px]"
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
      >
        {layout.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-muted">
            Tap pieces below to put them on the board, then drag them into place.
          </p>
        )}
        {layout.map((p, i) => {
          const piece = byId[p.item_id];
          return (
            <div
              key={p.item_id}
              data-piece={p.item_id}
              role="button"
              tabIndex={0}
              aria-label={`${piece.name}: drag to move`}
              aria-pressed={selected === p.item_id}
              className="absolute aspect-square cursor-grab active:cursor-grabbing"
              style={placementStyle(p, i + 1)}
              onPointerDown={(e) => onPointerDown(e, p)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.05 : 0.01;
                const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
                if (!move) return;
                e.preventDefault();
                patch(p.item_id, { x: Math.min(1, Math.max(0, p.x + move[0])), y: Math.min(1, Math.max(0, p.y + move[1])) });
              }}
            >
              <div className={`piece-inner h-full w-full rounded-2xl ${selected === p.item_id ? "outline-2 outline-dashed outline-accent" : ""}`}>
                <PieceArt piece={piece} />
              </div>
            </div>
          );
        })}
      </div>

      {sel ? (
        <div className="space-y-3 rounded-2xl bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{byId[sel.item_id].name}</p>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => bringToFront(sel.item_id)} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium">
                To front
              </button>
              <button type="button" onClick={() => toggle(byId[sel.item_id])} className="rounded-full px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10">
                Remove
              </button>
            </div>
          </div>
          <Slider label="Size" min={0.1} max={0.9} step={0.01} value={sel.scale} onChange={(scale) => patch(sel.item_id, { scale })} />
          <Slider label="Turn" min={-45} max={45} step={1} value={sel.rotate} onChange={(rotate) => patch(sel.item_id, { rotate })} />
        </div>
      ) : (
        layout.length > 1 && (
          <button type="button" onClick={autoArrange} className={`${secondaryButton} w-full`}>
            Auto-arrange as a flat-lay
          </button>
        )
      )}

      <section className="space-y-2" aria-label="Your pieces">
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          <button type="button" onClick={() => setFilter(null)} className={chipClass(!filter)}>
            All
          </button>
          {categories.map((c) => (
            <button key={c} type="button" onClick={() => setFilter(c)} className={chipClass(filter === c)}>
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {tray.map((p) => (
            <li key={p.id} className="shrink-0">
              <button
                type="button"
                onClick={() => toggle(p)}
                aria-pressed={onBoard.has(p.id)}
                aria-label={`${onBoard.has(p.id) ? "Take off" : "Add"} ${p.name}`}
                className={`relative h-24 w-20 rounded-2xl bg-surface p-1.5 transition active:scale-95 ${onBoard.has(p.id) ? "ring-2 ring-accent" : ""}`}
              >
                <PieceArt piece={p} />
                {onBoard.has(p.id) && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-ink">✓</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 text-sm">
        <span>
          <span className="block font-medium">Plan it for a day</span>
          <span className="text-muted">Shows on your looks calendar</span>
        </span>
        <input
          type="date"
          value={plannedFor}
          onChange={(e) => {
            setPlannedFor(e.target.value);
            setStatus({});
          }}
          className="h-10 rounded-xl bg-surface-2 px-2 text-foreground outline-none focus:ring-2 focus:ring-accent-strong"
        />
      </label>

      {look?.note && <p className="rounded-2xl bg-accent/10 p-4 text-sm leading-relaxed">{look.note}</p>}

      {status.error && (
        <p className="rounded-2xl bg-danger/10 p-3 text-sm text-danger" role="alert">
          {status.error}
        </p>
      )}

      <button type="button" disabled={saving || layout.length === 0} onClick={save} className={`${primaryButton} w-full`}>
        {saving && <Spinner />}
        {saving ? "Saving…" : status.saved ? "Saved ✓" : look ? "Save changes" : "Save look"}
      </button>
    </div>
  );
}

function Slider({ label, value, onChange, ...range }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="grid grid-cols-[3rem_1fr] items-center gap-3 text-sm text-muted">
      {label}
      <input type="range" value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[var(--accent)]" {...range} />
    </label>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { LinkPendingDot } from "@/components/LinkPending";
import { DirectionalPage } from "@/components/PageShell";
import { Spinner } from "@/components/Spinner";
import { PHOTO_BUCKET } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";

type Phase =
  | { step: "pick" }
  | { step: "working"; label: string }
  | { step: "done"; outfitId: string; items: number; created: number; matched: number; cutouts?: number }
  | { step: "error"; message: string; outfitId?: string };

const MAX_SIDE = 1600;

/** Downscale on the device so uploads are fast and the AI gets a sensible size. */
async function resizeImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process image"))), "image/jpeg", 0.85),
  );
  return { blob, width, height };
}

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

const noSubscribe = () => () => {};

/** Today's date in the viewer's timezone; empty while prerendering on the server. */
function useToday() {
  return useSyncExternalStore(noSubscribe, today, () => "");
}

export default function LogOutfitPage() {
  const router = useRouter();
  // Two pickers: `capture` opens the camera directly, the other opens the gallery.
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const todayDate = useToday();
  const [pickedDate, setDate] = useState<string | null>(null);
  const date = pickedDate ?? todayDate;
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<Phase>({ step: "pick" });

  function choose(f: File | undefined) {
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setPhase({ step: "pick" });
  }

  async function analyze(outfitId: string) {
    setPhase({ step: "working", label: "Finding and cutting out every piece…" });
    const res = await fetch(`/api/outfits/${outfitId}/analyze`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPhase({ step: "error", message: body.error ?? "Analysis failed", outfitId });
      return;
    }
    setPhase({ step: "done", outfitId, ...body });
    router.refresh();
  }

  async function submit() {
    if (!file) return;
    const supabase = createClient();

    try {
      setPhase({ step: "working", label: "Preparing photo…" });
      const { blob, width, height } = await resizeImage(file);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session expired. Please sign in again.");

      setPhase({ step: "working", label: "Uploading…" });
      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data: outfit, error: insertError } = await supabase
        .from("outfits")
        .insert({ worn_on: date || today(), photo_path: path, photo_w: width, photo_h: height, notes: notes || null })
        .select("id")
        .single();
      if (insertError) throw insertError;

      await analyze(outfit.id);
    } catch (err) {
      setPhase({ step: "error", message: err instanceof Error ? err.message : "Something went wrong" });
    }
  }

  const working = phase.step === "working";
  const field = "h-12 w-full rounded-xl bg-surface px-3.5 text-foreground outline-none focus:ring-2 focus:ring-accent-strong";

  return (
    <DirectionalPage>
      <div className="space-y-6">
        <h1 className="display rise text-[3.4rem] font-bold">What are you wearing?</h1>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Take a photo"
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Choose a photo from your gallery"
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={working}
          aria-label={preview ? "Change photo" : "Choose a photo"}
          className={`mirror relative mx-auto flex aspect-[3/4] w-[74%] items-center justify-center ${
            preview ? "bg-surface-2" : "border-2 border-dashed border-line bg-surface/70"
          }`}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Outfit preview" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-3 px-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-ink">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
                  <path d="M4 8.5h3l1.8-2.5h6.4L17 8.5h3V19H4z" />
                  <circle cx="12" cy="13.3" r="3.3" />
                </svg>
              </span>
              <span className="text-lg font-semibold">Add a mirror photo</span>
              <span className="text-sm text-muted">Head to toe, in good light. We&apos;ll find every piece.</span>
            </span>
          )}

          {working && (
            <span className="absolute inset-0 bg-[#2b1e17]/40" aria-live="polite">
              <span className="scan-line absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-accent/50 to-transparent">
                <span className="absolute inset-x-0 top-1/2 h-0.5 bg-accent shadow-[0_0_16px_2px_var(--accent)]" />
              </span>
              <span className="absolute inset-x-0 bottom-6 text-center text-sm font-semibold text-white">{phase.label}</span>
            </span>
          )}

        </button>

        {!working && phase.step !== "done" && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-surface font-semibold transition active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
                <path d="M4 8.5h3l1.8-2.5h6.4L17 8.5h3V19H4z" />
                <circle cx="12" cy="13.3" r="3.3" />
              </svg>
              {preview ? "Retake" : "Take photo"}
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-surface font-semibold transition active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
                <circle cx="9" cy="10" r="1.6" />
                <path d="m20.5 16-4.5-4.5L7 19.5" />
              </svg>
              {preview ? "Choose another" : "From gallery"}
            </button>
          </div>
        )}

        {phase.step !== "done" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-muted">
                Worn on
                <input
                  type="date"
                  value={date}
                  max={todayDate || undefined}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${field} mt-1`}
                />
              </label>
              <label className="text-sm text-muted">
                Note
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Office, wedding…"
                  className={`${field} mt-1 placeholder:text-muted/70`}
                />
              </label>
            </div>

            {phase.step === "error" && (
              <div className="rounded-2xl bg-danger/10 p-4 text-sm" role="alert">
                <p className="font-semibold">{phase.message}</p>
                {phase.outfitId && (
                  <button onClick={() => analyze(phase.outfitId!)} className="mt-2 font-semibold text-danger underline underline-offset-2">
                    Try again
                  </button>
                )}
              </div>
            )}

            <button
              onClick={submit}
              disabled={!file || working || (phase.step === "error" && !!phase.outfitId)}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-base font-semibold text-accent-ink transition active:scale-[0.99] disabled:bg-surface-2 disabled:text-muted"
            >
              {working && <Spinner className="h-5 w-5" />}
              {working ? "Reading your outfit…" : "Save to my wardrobe"}
            </button>
          </>
        )}

        {phase.step === "done" && (
          <div className="rise space-y-5 rounded-[1.75rem] bg-surface p-6" role="status">
            <div className="flex items-end gap-3">
              <span className="relative">
                <span className="display pop inline-block text-7xl font-bold text-accent-strong">{phase.items}</span>
                <Burst />
              </span>
              <span className="rise pb-1.5 text-xl font-semibold leading-tight [animation-delay:0.2s]">
                {phase.items === 1 ? "piece" : "pieces"}
                <br />
                saved
              </span>
            </div>
            <p className="text-muted">
              {phase.created} new to your wardrobe, {phase.matched} you&apos;ve worn before.
              {phase.cutouts ? ` ${phase.cutouts} cut out from the background.` : ""}
            </p>
            <p className="text-sm text-muted">ChatGPT is now drawing a clean picture of the whole look. It appears on the outfit in about half a minute.</p>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/outfits/${phase.outfitId}`}
                transitionTypes={["nav-forward"]}
                className="relative flex h-12 items-center justify-center gap-2 rounded-full bg-accent font-semibold text-accent-ink transition active:scale-[0.98]"
              >
                Review outfit
                <LinkPendingDot />
              </Link>
              <button
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  setNotes("");
                  setPhase({ step: "pick" });
                }}
                className="h-12 rounded-full bg-background font-semibold"
              >
                Log another
              </button>
            </div>
          </div>
        )}
      </div>
    </DirectionalPage>
  );
}

/** Butter and espresso dots bursting out of the saved-pieces count. */
function Burst() {
  const dots = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2;
    const r = 46 + (i % 3) * 10;
    return { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r, big: i % 2 === 0 };
  });
  return (
    <span className="burst pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
      {dots.map((d, i) => (
        <span
          key={i}
          className={`absolute rounded-full ${d.big ? "h-2.5 w-2.5 bg-accent" : "h-1.5 w-1.5 bg-foreground"}`}
          style={{ "--dx": `${d.dx}px`, "--dy": `${d.dy}px` } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "grwm-install-dismissed";
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;

type Platform = "installed" | "ios" | "other";

function detectPlatform(): Platform {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "other";
}

const noSubscribe = () => () => {};

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(at) && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

/**
 * "Install the app" card. Android/desktop Chrome get the browser's own install
 * dialog; iPhone has no install API, so it explains Share → Add to Home Screen.
 * Hidden once installed, and for two weeks after "Not now".
 */
export function InstallPrompt({ className = "" }: { className?: string }) {
  // Browser-only facts; null while prerendering so nothing flashes on the server.
  const platform = useSyncExternalStore<Platform | null>(noSubscribe, detectPlatform, () => null);
  const hiddenByUser = useSyncExternalStore(noSubscribe, dismissedRecently, () => true);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // Show our card instead of the mini-infobar.
      setInstallEvent(e as InstallEvent);
    };
    const onInstalled = () => setClosed(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const canInstall = platform === "ios" || (platform === "other" && installEvent);
  if (!canInstall || hiddenByUser || closed) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private mode: just hide for this visit.
    }
    setClosed(true);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setClosed(true);
    setInstallEvent(null);
  }

  return (
    <section aria-label="Install the app" className={`rise rounded-[1.5rem] bg-surface p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <svg viewBox="0 0 512 512" className="h-11 w-11 shrink-0 rounded-[0.7rem]" aria-hidden>
          <rect width="512" height="512" rx="112" fill="#2b1e17" />
          <path d="M146 430V236a110 110 0 0 1 220 0v194z" fill="#f2c14e" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">Put GRWM on your home screen</p>
          {platform === "ios" ? (
            <ol className="mt-1.5 space-y-1 text-sm text-muted">
              <li className="flex items-center gap-1.5">
                1. Tap
                <ShareIcon />
                <span className="font-medium text-foreground">Share</span>
                in the browser bar
              </li>
              <li>
                2. Choose <span className="font-medium text-foreground">Add to Home Screen</span>
              </li>
            </ol>
          ) : (
            <p className="mt-1 text-sm text-muted">Opens full screen, straight to your wardrobe.</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={dismiss} className="h-10 rounded-full px-4 text-sm font-medium text-muted hover:bg-background">
          Not now
        </button>
        {platform !== "ios" && (
          <button type="button" onClick={install} className="h-10 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink">
            Install app
          </button>
        )}
      </div>
    </section>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-4 w-4 text-foreground" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5v10h14V11h-1" />
    </svg>
  );
}

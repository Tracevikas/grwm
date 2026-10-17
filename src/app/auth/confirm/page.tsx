"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { createClient } from "@/lib/supabase/client";

/**
 * Landing page for the sign-in email link. Supabase puts the session (or an
 * error) in the URL fragment, which only the browser can read, so this page
 * saves it as cookies and continues to the wardrobe.
 */
export default function ConfirmPage() {
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    // Clear tokens from the address bar and history straight away.
    window.history.replaceState(null, "", window.location.pathname);

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) {
      const reason = params.get("error_code") === "otp_expired" ? "This sign-in link has expired or was already used." : params.get("error_description");
      queueMicrotask(() => setProblem(reason || "This sign-in link isn't valid."));
      return;
    }

    createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) setProblem("This sign-in link has expired or was already used.");
        else window.location.replace("/");
      });
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-6 pb-10 pt-8">
      <Wordmark className="text-lg" />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mirror flex aspect-[3/4] w-28 items-end justify-center bg-accent pb-5" aria-hidden>
          {!problem && <span className="h-3 w-3 animate-pulse rounded-full bg-accent-ink motion-reduce:animate-none" />}
        </div>
        {problem ? (
          <div className="mt-6 space-y-4" role="alert">
            <p className="text-lg font-semibold">{problem}</p>
            <p className="text-muted">Links work once and expire after an hour. Send yourself a new one.</p>
            <Link href="/login" className="inline-flex h-12 items-center rounded-full bg-foreground px-6 font-semibold text-background">
              Back to sign in
            </Link>
          </div>
        ) : (
          <p className="mt-6 text-lg font-semibold" role="status">
            Signing you in…
          </p>
        )}
      </div>
    </main>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Spinner } from "@/components/Spinner";
import { Wordmark } from "@/components/Wordmark";
import { sendCode, signInWithGoogle, verifyCode, type AuthState } from "./actions";

const RESEND_AFTER = 60;

const LINK_ERRORS: Record<string, string> = {
  google: "Google sign-in didn't start. Try again.",
  link: "Sign-in didn't finish. Try again, or use the email link instead.",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-6 pb-10 pt-8">
      <Wordmark className="text-lg" />

      <div className="relative mt-8">
        <div className="mirror relative mx-auto aspect-[3/4] w-[70%] bg-accent">
          <div className="absolute inset-0 bg-[radial-gradient(120%_70%_at_30%_15%,rgba(255,255,255,0.35),transparent_55%)]" />
          <div className="absolute left-[18%] top-[14%] h-[22%] w-[10%] -rotate-12 rounded-full bg-white/40 blur-[2px]" />
          <div className="sheen absolute -inset-y-1/4 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent" aria-hidden />
        </div>
        <h1 className="display rise absolute inset-x-0 bottom-[8%] text-center text-[3.3rem] font-extrabold text-accent-ink">
          get ready
          <br />
          with me
        </h1>
      </div>

      <p className="mt-6 text-center text-[1.05rem] leading-relaxed text-muted">
        Snap your outfit each morning. Every piece gets saved, so you can plan tomorrow without opening the wardrobe.
      </p>

      {/* useSearchParams needs a boundary under Cache Components. */}
      <Suspense fallback={<SignIn linkError={null} />}>
        <SignInWithParams />
      </Suspense>

      <InstallPrompt className="mt-8" />
    </main>
  );
}

function SignInWithParams() {
  const params = useSearchParams();
  const error = params.get("error");
  const reason = params.get("reason");

  // If Supabase sent the email link's session here instead of /auth/confirm
  // (redirect URL not allow-listed), hand it over rather than losing it.
  useEffect(() => {
    if (window.location.hash.includes("access_token=")) window.location.replace(`/auth/confirm${window.location.hash}`);
  }, []);

  const message = error ? LINK_ERRORS[error] : undefined;
  return <SignIn linkError={message ? (reason ? `${message} (${reason})` : message) : null} />;
}

function SignIn({ linkError }: { linkError: string | null }) {
  const [sent, send, sending] = useActionState<AuthState, FormData>(sendCode, {});
  const [checked, verify, verifying] = useActionState<AuthState, FormData>(verifyCode, {});
  // "Use a different email" hides this particular result; the next send produces a new one.
  const [dismissed, setDismissed] = useState<AuthState | null>(null);
  const email = dismissed === sent ? undefined : sent.email;

  return (
    <div className="mt-8 space-y-4">
      {linkError && !sent.email && (
        <p className="rounded-2xl bg-danger/10 p-3 text-sm text-danger" role="alert">
          {linkError}
        </p>
      )}

      {email ? (
        <LinkSent
          email={email}
          send={send}
          sending={sending}
          sendError={sent.error}
          verify={verify}
          verifying={verifying}
          verifyError={checked.error}
          onChangeEmail={() => setDismissed(sent)}
        />
      ) : (
        <>
          <form action={signInWithGoogle}>
            <GoogleButton />
          </form>

          <div className="flex items-center gap-3 text-sm text-muted" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>

          <form action={send} className="space-y-3">
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="Email"
              aria-label="Email"
              defaultValue={sent.email}
              className="h-13 w-full rounded-2xl bg-surface px-4 text-[0.95rem] outline-none placeholder:text-muted focus:ring-2 focus:ring-accent-strong"
            />
            {sent.error && dismissed !== sent && (
              <p className="text-sm font-medium text-danger" role="alert">
                {sent.error}
              </p>
            )}
            <button
              disabled={sending}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-foreground text-base font-semibold text-background transition active:scale-[0.99] disabled:opacity-70"
            >
              {sending && <Spinner />}
              {sending ? "Sending link…" : "Email me a sign-in link"}
            </button>
          </form>
          <p className="text-center text-xs text-muted">New here? The same link creates your account.</p>
        </>
      )}
    </div>
  );
}

type LinkSentProps = {
  email: string;
  send: (fd: FormData) => void;
  sending: boolean;
  sendError?: string;
  verify: (fd: FormData) => void;
  verifying: boolean;
  verifyError?: string;
  onChangeEmail: () => void;
};

function LinkSent({ email, send, sending, sendError, verify, verifying, verifyError, onChangeEmail }: LinkSentProps) {
  const [wait, setWait] = useState(RESEND_AFTER);

  // Supabase allows one email per minute per address.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  return (
    <div className="space-y-5">
      <div className="rounded-[1.75rem] bg-surface p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-ink" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
            <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
            <path d="m4 7.5 8 6 8-6" />
          </svg>
        </span>
        <p className="mt-4 text-xl font-semibold">Check your email</p>
        <p className="mt-1 text-muted">
          We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>.
        </p>
        <p className="mt-3 text-sm text-muted">Tap the link in the email to sign in. Not there? Check spam or promotions.</p>
        {sendError && (
          <p className="mt-3 text-sm font-medium text-danger" role="alert">
            {sendError}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onChangeEmail} className="font-medium text-muted underline-offset-2 hover:underline">
          Use a different email
        </button>
        <form action={send} onSubmit={() => setWait(RESEND_AFTER)}>
          <input type="hidden" name="email" value={email} />
          <button disabled={wait > 0 || sending} className="font-medium text-accent-strong disabled:text-muted">
            {sending ? "Sending…" : wait > 0 ? `Resend link in ${wait}s` : "Resend link"}
          </button>
        </form>
      </div>

      {/* For emails that show a code (when the template includes {{ .Token }}). */}
      <details className="group text-sm" open={Boolean(verifyError)}>
        <summary className="cursor-pointer list-none text-center font-medium text-muted underline-offset-2 hover:underline">
          Got a code instead? Enter it
        </summary>
        <form action={verify} className="mt-3 space-y-3">
          <input type="hidden" name="email" value={email} />
          <input
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6,10}"
            maxLength={10}
            placeholder="••••••"
            aria-label="Sign-in code"
            className="h-14 w-full rounded-2xl bg-surface px-4 text-center font-mono text-2xl tracking-[0.4em] outline-none placeholder:text-muted/50 focus:ring-2 focus:ring-accent-strong"
          />
          {verifyError && (
            <p className="font-medium text-danger" role="alert">
              {verifyError}
            </p>
          )}
          <button
            disabled={verifying}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground font-semibold text-background transition active:scale-[0.99] disabled:opacity-70"
          >
            {verifying && <Spinner />}
            {verifying ? "Checking…" : "Sign in with code"}
          </button>
        </form>
      </details>
    </div>
  );
}

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-surface text-base font-semibold ring-1 ring-line transition active:scale-[0.99] disabled:opacity-80"
    >
      {pending ? (
        <>
          <Spinner className="h-5 w-5" />
          Opening Google…
        </>
      ) : (
        <GoogleLabel />
      )}
    </button>
  );
}

function GoogleLabel() {
  return (
    <>
      <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      Continue with Google
    </>
  );
}

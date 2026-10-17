"use client";

import { useActionState, useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { signIn, signUp, type AuthState } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "in" ? signIn : signUp, {});
  const field = "h-13 w-full rounded-2xl bg-surface px-4 text-[0.95rem] outline-none placeholder:text-muted focus:ring-2 focus:ring-accent-strong";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-6 pb-10 pt-8">
      <Wordmark className="text-lg" />

      <div className="relative mt-8">
        <div className="mirror relative mx-auto aspect-[3/4] w-[78%] bg-accent">
          <div className="absolute inset-0 bg-[radial-gradient(120%_70%_at_30%_15%,rgba(255,255,255,0.35),transparent_55%)]" />
          <div className="absolute left-[18%] top-[14%] h-[22%] w-[10%] -rotate-12 rounded-full bg-white/40 blur-[2px]" />
        </div>
        <h1 className="display absolute inset-x-0 bottom-[8%] text-center text-[3.6rem] font-extrabold text-accent-ink">
          get ready
          <br />
          with me
        </h1>
      </div>

      <p className="mt-6 text-center text-[1.05rem] leading-relaxed text-muted">
        Snap your outfit each morning. Every piece gets saved, so you can plan tomorrow without opening the wardrobe.
      </p>

      <form action={action} className="mt-8 space-y-3">
        <input name="email" type="email" required autoComplete="email" placeholder="Email" aria-label="Email" className={field} />
        <input
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          placeholder="Password"
          aria-label="Password"
          className={field}
        />
        {state.error && (
          <p className="text-sm font-medium text-danger" role="alert">
            {state.error}
          </p>
        )}
        {state.message && (
          <p className="text-sm font-medium" role="status">
            {state.message}
          </p>
        )}
        <button
          disabled={pending}
          className="h-14 w-full rounded-full bg-foreground text-base font-semibold text-background transition active:scale-[0.99] disabled:opacity-60"
        >
          {pending ? "One sec…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 text-sm font-medium text-muted">
        {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </main>
  );
}

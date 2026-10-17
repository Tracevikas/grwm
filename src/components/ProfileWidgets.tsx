"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { deleteMyAccount, deleteMyData, updateName, type ProfileState } from "@/app/(app)/profile/actions";
import { currentStreak } from "@/lib/profile";
import { Spinner } from "./Spinner";
import { SubmitButton } from "./SubmitButton";

const noSubscribe = () => () => {};
function localToday() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** Days in a row with a logged outfit, using the viewer's own date. */
export function Streak({ days }: { days: string[] }) {
  const today = useSyncExternalStore(noSubscribe, localToday, () => null);
  const streak = today ? currentStreak(days, today) : null;
  return (
    <>
      <p className="display text-5xl font-bold tabular-nums">{streak ?? "–"}</p>
      <p className="mt-1 text-sm text-muted">
        {streak === 1 ? "day in a row" : "days in a row"}
        {streak === 0 && days.length > 0 ? ". Log today to start again" : ""}
      </p>
    </>
  );
}

export function NameForm({ name }: { name: string }) {
  const [state, action] = useActionState<ProfileState, FormData>(updateName, {});
  return (
    <form action={action} className="space-y-2">
      <label className="block text-sm text-muted" htmlFor="profile-name">
        Display name
      </label>
      <div className="flex gap-2">
        <input
          id="profile-name"
          name="name"
          defaultValue={name}
          maxLength={60}
          autoComplete="name"
          className="h-12 min-w-0 flex-1 rounded-xl bg-background px-3.5 outline-none focus:ring-2 focus:ring-accent-strong"
        />
        <SubmitButton pendingLabel="Saving…" className="h-12 shrink-0 rounded-full bg-foreground px-5 font-semibold text-background">
          Save
        </SubmitButton>
      </div>
      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p className="rise text-sm text-accent-strong" role="status">
          Saved.
        </p>
      )}
    </form>
  );
}

type DangerProps = { pieces: number; outfits: number };

/** Two destructive actions, each behind a second, explicit confirmation. */
export function DangerZone({ pieces, outfits }: DangerProps) {
  const [confirming, setConfirming] = useState<"data" | "account" | null>(null);
  const [state, run, pending] = useActionState<ProfileState, "data" | "account">(
    async (_prev, which) => (which === "data" ? deleteMyData() : deleteMyAccount()),
    {},
  );

  const what = `${outfits} ${outfits === 1 ? "outfit" : "outfits"} and ${pieces} ${pieces === 1 ? "piece" : "pieces"}`;

  return (
    <section className="space-y-3 rounded-[1.5rem] p-4 ring-1 ring-danger/30" aria-labelledby="danger-title">
      <h2 id="danger-title" className="font-semibold text-danger">
        Danger zone
      </h2>

      {confirming ? (
        <div className="rise space-y-3 rounded-2xl bg-danger/10 p-4" role="alertdialog" aria-labelledby="confirm-title">
          <p id="confirm-title" className="font-semibold">
            {confirming === "data" ? `Delete all ${what}?` : "Delete your account?"}
          </p>
          <p className="text-sm text-muted">
            {confirming === "data"
              ? "Every photo, cut-out and outfit is removed for good. Your account stays, so you can start fresh."
              : `This removes ${what}, every photo, and your sign-in. It can't be undone.`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(null)}
              className="h-11 flex-1 rounded-full bg-surface text-sm font-semibold"
            >
              Keep everything
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(confirming)}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-danger text-sm font-semibold text-white disabled:opacity-80"
            >
              {pending && <Spinner />}
              {pending ? "Deleting…" : confirming === "data" ? "Delete everything" : "Delete account"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setConfirming("data")}
            className="flex h-11 w-full items-center justify-between rounded-xl px-3 text-sm font-medium text-danger hover:bg-danger/10"
          >
            Delete all my outfits and pieces
            <span aria-hidden>›</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirming("account")}
            className="flex h-11 w-full items-center justify-between rounded-xl px-3 text-sm font-medium text-danger hover:bg-danger/10"
          >
            Delete my account
            <span aria-hidden>›</span>
          </button>
        </div>
      )}

      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
    </section>
  );
}

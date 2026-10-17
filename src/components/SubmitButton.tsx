"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "./Spinner";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Label while the form's server action is running, e.g. "Deleting…". */
  pendingLabel: string;
};

/** A form's submit button that shows a spinner while its server action runs. */
export function SubmitButton({ pendingLabel, children, className = "", disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={`inline-flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:cursor-wait ${className}`}
    >
      {pending ? (
        <>
          <Spinner />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

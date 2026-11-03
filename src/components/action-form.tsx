"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

export type ActionResult = { error?: string; success?: string } | undefined | void;

export function SubmitButton({ children, className = "btn-primary", pending = "Please wait…" }: { children: React.ReactNode; className?: string; pending?: string }) {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className={className}>
      {status.pending ? pending : children}
    </button>
  );
}

/** A submit button that asks first, for changes that cannot be undone. */
export function ConfirmSubmit({ message, children, className = "btn-danger w-full" }: { message: string; children: React.ReactNode; className?: string }) {
  const status = useFormStatus();
  const [asking, setAsking] = useState(false);

  // Asks on the page itself, because embedded browsers can silently block window.confirm.
  if (!asking) {
    return (
      <button type="button" className={className} onClick={() => setAsking(true)}>
        {children}
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-label="Please confirm" className="space-y-2 rounded-2xl bg-warn-soft p-3">
      <p className="text-sm font-medium text-warn">{message}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost" disabled={status.pending} onClick={() => setAsking(false)}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={status.pending}>
          {status.pending ? "Please wait…" : "Yes, continue"}
        </button>
      </div>
    </div>
  );
}

export function ActionForm({
  action,
  children,
  className = "space-y-4",
  resetOnSuccess = false,
}: {
  action: (state: ActionResult, data: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const submitted = useRef<FormData | null>(null);
  const [state, formAction] = useActionState((previous: ActionResult, data: FormData) => {
    submitted.current = data;
    return action(previous, data);
  }, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.success) ref.current?.reset();
    // React clears a form after every submit, so a refused form gets its values back. Passwords stay cleared.
    if (!state?.error || !ref.current || !submitted.current) return;
    for (const [name, value] of submitted.current) {
      const field = ref.current.elements.namedItem(name);
      if (!field || (field as HTMLInputElement).type === "password" || (field as HTMLInputElement).type === "hidden" || typeof value !== "string") continue;
      (field as HTMLInputElement).value = value;
    }
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-2.5 text-sm font-medium text-bad">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="rounded-2xl bg-good-soft px-4 py-2.5 text-sm font-medium text-good">
          {state.success}
        </p>
      )}
    </form>
  );
}

"use client";

import { useEffect, useRef, useActionState } from "react";

export function ActionForm({
  action,
  children,
  className,
  successMessage,
  resetOnSuccess = false
}: {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  const [state, formAction, pending] = useActionState(async (_prev: { error?: string } | null, formData: FormData) => {
    submitted.current = true;
    const result = await action(formData);
    if (result && "error" in result && result.error) return { error: result.error };
    return null;
  }, null);
  const success = state === null && submitted.current && !pending;

  useEffect(() => {
    if (resetOnSuccess && success && formRef.current) formRef.current.reset();
  }, [success, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      {successMessage && success && (
        <p className="text-xs text-emerald-600 " role="status">
          {successMessage}
        </p>
      )}
      {state?.error && (
        <p className="text-xs text-rose-600 " role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

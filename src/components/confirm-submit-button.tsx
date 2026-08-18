"use client";

import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({
  confirmText,
  children,
  pendingLabel,
  className
}: {
  confirmText: string;
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      className={`cursor-pointer disabled:opacity-50 ${className ?? ""}`}
    >
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}

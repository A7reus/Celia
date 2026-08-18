"use client";

import { useFormStatus } from "react-dom";

export function GenerateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
    >
      {pending ? "Pairing..." : "Generate next round"}
    </button>
  );
}

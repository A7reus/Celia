"use client";

import { useState } from "react";
import { wipeAllAction } from "@/lib/actions";

export function WipeAllButton() {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setError(null);
    if (!armed) {
      setArmed(true);
      return;
    }
    if (!window.confirm("Delete ALL tournaments and all non-super admin accounts? This cannot be undone.")) {
      setArmed(false);
      return;
    }
    setPending(true);
    const result = await wipeAllAction();
    setPending(false);
    setArmed(false);
    if (result.error) {
      setError(result.error);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={
          armed
            ? "rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
            : "rounded-md border border-rose-300 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
        }
      >
        {pending ? "Wiping..." : armed ? "Click again to confirm" : "Wipe everything"}
      </button>
      {error && (
        <p className="mt-2 text-xs text-rose-600 " role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

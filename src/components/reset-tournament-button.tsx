"use client";

import { useState } from "react";
import { resetTournamentAction } from "@/lib/actions";

export function ResetTournamentButton({ tournamentId }: { tournamentId: number }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (
      !window.confirm("Delete ALL rounds, pairings and results? Players and settings are kept. This cannot be undone.")
    ) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await resetTournamentAction(tournamentId);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md border-rose-300 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
      >
        {pending ? "Resetting..." : "Reset tournament"}
      </button>
      {error && <span className="text-xs text-rose-600 ">{error}</span>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { simulateAction } from "@/lib/actions";
import type { SimulationResult } from "@/types";
import { StandingsTable } from "@/components/standings-table";

export function SimulateButton() {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setResult(await simulateAction());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    }
    setRunning(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm flex-wrap items-center gap-3">
        <button
          onClick={run}
          disabled={running}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
        >
          {running ? "Simulating..." : "Simulate full tournament"}
        </button>
        <p className="text-xs text-slate-500 ">
          Plays out all remaining rounds with deterministic random results (weighted by rating) to preview the final
          standings. Nothing is written to the database.
        </p>
      </div>
      {error && <p className="text-sm text-rose-600 ">{error}</p>}
      {result && (
        <div className="rounded-lg border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700 ">
            Simulated final standings after {result.rounds} rounds
          </div>
          <StandingsTable standings={result.standings} roundCount={result.rounds} />
        </div>
      )}
    </div>
  );
}

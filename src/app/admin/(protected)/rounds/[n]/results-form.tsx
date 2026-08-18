"use client";

import { useState } from "react";
import type { GameResult, PairingRow } from "@/types";
import { saveResultsAction } from "@/lib/actions";

const OPTIONS: { value: GameResult; label: string }[] = [
  { value: "1-0", label: "1-0" },
  { value: "1/2", label: "½-½" },
  { value: "0-1", label: "0-1" },
  { value: "+", label: "White wins by forfeit" },
  { value: "-", label: "Black wins by forfeit" }
];

export function ResultsForm({
  roundId,
  pairings,
  names
}: {
  roundId: number;
  pairings: PairingRow[];
  names: Map<number, string>;
}) {
  const games = pairings.filter((p) => !p.isBye);
  const [results, setResults] = useState<Record<string, GameResult | null>>(
    Object.fromEntries(games.map((g) => [String(g.id), g.result]))
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    const form = new FormData();
    form.set("round_id", String(roundId));
    form.set("results", JSON.stringify(results));
    const result = await saveResultsAction(form);
    if (result.error) setMessage(result.error);
    setSaving(false);
  }

  const entered = games.filter((g) => results[String(g.id)] != null).length;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <span className="text-sm font-medium text-slate-700 ">Enter results</span>
          <span className="text-xs text-slate-400 ">
            {entered} / {games.length} entered
          </span>
        </div>
        <div className="divide-y divide-slate-100 ">
          {games.map((g) => (
            <div key={g.id} className="flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
              <span className="w-8 text-slate-400 tabular-nums">{g.board}</span>
              <span className="min-w-32 font-medium text-slate-800 truncate">
                {g.whiteId != null ? (names.get(g.whiteId) ?? "?") : "?"}
              </span>
              <span className="text-slate-300 ">vs</span>
              <span className="min-w-32 font-medium text-slate-800 truncate">
                {g.blackId != null ? (names.get(g.blackId) ?? "?") : "?"}
              </span>
              <div className="ml-auto flex-wrap items-center gap-1">
                {OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`cursor-pointer rounded-md border px-2 py-1 text-xs ${
                      results[String(g.id)] === opt.value
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50 "
                    }`}
                  >
                    <input
                      type="radio"
                      name={`result-${g.id}`}
                      className="sr-only"
                      checked={results[String(g.id)] === opt.value}
                      onChange={() => setResults((prev) => ({ ...prev, [String(g.id)]: opt.value }))}
                    />
                    {opt.label}
                  </label>
                ))}
                {results[String(g.id)] != null && (
                  <button
                    type="button"
                    onClick={() => setResults((prev) => ({ ...prev, [String(g.id)]: null }))}
                    className="rounded-md border-rose-200 px-2 py-1 text-xs text-rose-500 hover:bg-rose-50 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 px-4 py-3 flex items-center gap-3">
          {message && <span className="text-xs text-amber-700 ">{message}</span>}
          <button
            onClick={save}
            disabled={saving}
            className="ml-auto rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving..." : "Save results"}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 ">
        Use "forfeit" when a player does not show up. Byes are scored automatically as half a point. Once every game has
        a result, press "Complete round" above to lock it and pair the next one.
      </p>
    </div>
  );
}

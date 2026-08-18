"use client";

import { useActionState, useState } from "react";
import type { Board, PairingRow, Player } from "@/types";
import { savePairingsAction } from "@/lib/actions";

export function PairingEditor({
  roundId,
  initialPairings,
  players
}: {
  roundId: number;
  initialPairings: PairingRow[];
  players: Player[];
}) {
  const active = players.filter((p) => p.active === 1);
  const [boards, setBoards] = useState<Board[]>(
    initialPairings.map((p) => ({
      whiteId: p.whiteId,
      blackId: p.blackId,
      isBye: p.isBye,
      byeForId: p.byeForId
    }))
  );
  const [state, formAction, pending] = useActionState(async (_prev: { error?: string } | null, formData: FormData) => {
    formData.set("pairs", JSON.stringify(boards));
    return savePairingsAction(formData);
  }, null);

  function setBoard(index: number, patch: Partial<Board>) {
    setBoards((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function removeBoard(index: number) {
    setBoards((prev) => prev.filter((_, i) => i !== index));
  }

  function addBoard() {
    setBoards((prev) => [...prev, { whiteId: null, blackId: null, isBye: false, byeForId: null }]);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <span className="text-sm font-medium text-slate-700 ">Draft pairings: adjust if needed</span>
          <span className="text-xs text-slate-400 ">{boards.length} boards</span>
        </div>
        <div className="divide-y divide-slate-100 ">
          {boards.map((b, i) => (
            <div key={i} className="flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="w-8 text-slate-400 tabular-nums text-sm">{i + 1}</span>
              {b.isBye ? (
                <>
                  <select
                    value={b.byeForId ?? ""}
                    onChange={(e) => setBoard(i, { byeForId: e.target.value ? Number(e.target.value) : null })}
                    className="rounded-md border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select player...</option>
                    {active.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 ">bye</span>
                </>
              ) : (
                <>
                  <select
                    value={b.whiteId ?? ""}
                    onChange={(e) => setBoard(i, { whiteId: e.target.value ? Number(e.target.value) : null })}
                    className="rounded-md border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">White...</option>
                    {active.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-slate-300 text-sm">vs</span>
                  <select
                    value={b.blackId ?? ""}
                    onChange={(e) => setBoard(i, { blackId: e.target.value ? Number(e.target.value) : null })}
                    className="rounded-md border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Black...</option>
                    {active.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <button
                type="button"
                onClick={() =>
                  setBoard(
                    i,
                    b.isBye ? { isBye: false, byeForId: null } : { isBye: true, whiteId: null, blackId: null }
                  )
                }
                className="ml-auto rounded-md border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 cursor-pointer"
              >
                {b.isBye ? "Make a game" : "Make a bye"}
              </button>
              <button
                type="button"
                onClick={() => removeBoard(i)}
                className="rounded-md border-rose-200 px-2 py-1 text-xs text-rose-500 hover:bg-rose-50 cursor-pointer"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 px-4 py-2.5 flex items-center gap-3">
          <button
            type="button"
            onClick={addBoard}
            className="rounded-md border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            + Add board
          </button>
          {state?.error && <span className="text-xs text-amber-700 ">{state.error}</span>}
          <form action={formAction} className="ml-auto">
            <input type="hidden" name="round_id" value={roundId} />
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
            >
              {pending ? "Saving..." : "Save pairings"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

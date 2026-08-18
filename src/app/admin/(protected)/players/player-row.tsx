"use client";

import { useState } from "react";
import type { Player } from "@/types";
import { updatePlayerAction, togglePlayerActiveAction, deletePlayerAction } from "@/lib/actions";

export function PlayerRow({ player }: { player: Player }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);
  const [rating, setRating] = useState(String(player.rating));
  const [ratingType, setRatingType] = useState(player.ratingType);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const form = new FormData();
    form.set("id", String(player.id));
    form.set("name", name);
    form.set("rating", rating);
    form.set("rating_type", ratingType);
    const result = await updatePlayerAction(form);
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setEditing(false);
    setSaving(false);
  }

  async function remove() {
    if (!window.confirm(`Delete ${player.name}? This cannot be undone.`)) return;
    setError(null);
    const form = new FormData();
    form.set("id", String(player.id));
    const result = await deletePlayerAction(form);
    if (result.error) setError(result.error);
  }

  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-3">
      {editing ? (
        <div className="flex-1 flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-40 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            type="number"
            className="w-20 rounded-md border-slate-300 px-2.5 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={ratingType}
            onChange={(e) => setRatingType(e.target.value as "manual" | "fide")}
            className="rounded-md border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="manual">Manual</option>
            <option value="fide">FIDE</option>
          </select>
          {error && <span className="text-xs text-rose-600 ">{error}</span>}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-md border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`font-medium truncate ${player.active ? "text-slate-800 " : "text-slate-400 line-through"}`}
            >
              {player.name}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                player.ratingType === "fide" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600 "
              }`}
            >
              {player.ratingType === "fide" ? "FIDE" : "Manual"}
            </span>
            <span className="text-sm text-slate-500 tabular-nums">{player.rating}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Edit
            </button>
            <form action={togglePlayerActiveAction}>
              <input type="hidden" name="id" value={player.id} />
              <input type="hidden" name="active" value={player.active} />
              <button
                type="submit"
                className={`rounded-md px-2.5 py-1 text-xs border cursor-pointer ${
                  player.active
                    ? "border-amber-300 text-amber-700 hover:bg-amber-50 "
                    : "border-emerald-300 text-emerald-700 hover:bg-emerald-50 "
                }`}
              >
                {player.active ? "Deactivate" : "Activate"}
              </button>
            </form>
            <button
              onClick={remove}
              className="rounded-md border-rose-300 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 cursor-pointer"
            >
              Delete
            </button>
          </div>
          {error && <span className="text-xs text-rose-600 ">{error}</span>}
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminSummary, Tournament, TournamentType } from "@/types";
import {
  deleteTournamentAction,
  setTournamentAdminAction,
  setTournamentStatusAction,
  updateTournamentAction
} from "@/lib/actions";

const TYPE_LABELS: Record<TournamentType, string> = {
  intradept: "Intradept",
  interdept: "Interdept",
  other: "Other"
};

export function TournamentRow({ tournament, admins }: { tournament: Tournament; admins: AdminSummary[] }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tournament.name);
  const [description, setDescription] = useState(tournament.description ?? "");
  const [type, setType] = useState<TournamentType>(tournament.type);
  const [adminId, setAdminId] = useState(tournament.adminId ? String(tournament.adminId) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveEdit() {
    setSaving(true);
    setError(null);
    const form = new FormData();
    form.set("tournament_id", String(tournament.id));
    form.set("name", name);
    form.set("description", description);
    form.set("type", type);
    const result = await updateTournamentAction(form);
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setEditing(false);
    setSaving(false);
  }

  async function toggleStatus() {
    const status = tournament.status === "active" ? "archived" : "active";
    if (
      status === "archived" &&
      !window.confirm(`Archive "${tournament.name}"? It stays visible but is marked as finished.`)
    ) {
      return;
    }
    setError(null);
    const form = new FormData();
    form.set("tournament_id", String(tournament.id));
    form.set("status", status);
    const result = await setTournamentStatusAction(form);
    if (result.error) setError(result.error);
  }

  async function assignAdmin() {
    setError(null);
    const form = new FormData();
    form.set("tournament_id", String(tournament.id));
    form.set("admin_id", adminId);
    const result = await setTournamentAdminAction(form);
    if (result.error) setError(result.error);
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete "${tournament.name}" and ALL its players, rounds, pairings and results? This cannot be undone.`
      )
    ) {
      return;
    }
    setError(null);
    const form = new FormData();
    form.set("tournament_id", String(tournament.id));
    const result = await deleteTournamentAction(form);
    if (result.error) setError(result.error);
  }

  return (
    <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-1.5">
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-52 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TournamentType)}
              className="rounded-md border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="intradept">Intradept</option>
              <option value="interdept">Interdept</option>
              <option value="other">Other</option>
            </select>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setName(tournament.name);
                setDescription(tournament.description ?? "");
                setType(tournament.type);
              }}
              className="rounded-md border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Description (shown on the listing, searchable)"
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/${tournament.slug}`} className="font-medium text-slate-800 hover:text-indigo-600">
              {tournament.name}
            </Link>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ">
              {TYPE_LABELS[tournament.type]}
            </span>
            {tournament.status === "archived" && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 ">
                Archived
              </span>
            )}
          </div>
        )}
        {!editing && tournament.description && (
          <p className="text-xs text-slate-500 line-clamp-2 ">{tournament.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-slate-500 ">Admin:</span>
          <select
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
            onBlur={assignAdmin}
            className="rounded-md border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">None</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.username}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400 ">changes apply on selection</span>
        </div>
        {error && <span className="block text-xs text-rose-600 ">{error}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="rounded-md border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          Edit
        </button>
        <button
          onClick={toggleStatus}
          className="rounded-md border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          {tournament.status === "active" ? "Archive" : "Restore"}
        </button>
        <button
          onClick={remove}
          className="rounded-md border-rose-300 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 cursor-pointer"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

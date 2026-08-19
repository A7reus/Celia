"use client";

import { useState } from "react";
import type { AdminSummary } from "@/types";
import { deleteAdminAction, resetAdminPasswordAction } from "@/lib/actions";

export function AdminRow({ admin, canDelete }: { admin: AdminSummary; canDelete: boolean }) {
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function resetPassword() {
    if (password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    setResetting(true);
    setError(null);
    const form = new FormData();
    form.set("admin_id", String(admin.id));
    form.set("password", password);
    const result = await resetAdminPasswordAction(form);
    if (result.error) setError(result.error);
    setPassword("");
    setResetting(false);
  }

  async function remove() {
    if (!window.confirm(`Delete account "${admin.username}"? Tournaments assigned to it become unassigned.`)) return;
    setError(null);
    const form = new FormData();
    form.set("admin_id", String(admin.id));
    const result = await deleteAdminAction(form);
    if (result.error) setError(result.error);
  }

  return (
    <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="font-medium text-slate-800 ">{admin.username}</span>
        {admin.isSuper && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 ">
            Super admin
          </span>
        )}
        <span className="text-xs text-slate-400 ">created {new Date(admin.createdAt).toLocaleDateString()}</span>
        {error && <span className="text-xs text-rose-600 ">{error}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {resetting ? (
          <>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="New password"
              autoFocus
              className="w-36 rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={resetPassword}
              className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs text-white hover:bg-indigo-700 cursor-pointer"
            >
              Set
            </button>
            <button
              onClick={() => setResetting(false)}
              className="rounded-md border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setResetting(true)}
            className="rounded-md border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            Reset password
          </button>
        )}
        <button
          onClick={remove}
          disabled={!canDelete}
          title={canDelete ? undefined : "You cannot delete your own account or the last super admin"}
          className="rounded-md border-rose-300 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

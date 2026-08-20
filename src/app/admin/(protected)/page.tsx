import { redirect } from "next/navigation";
import { listAdmins, listTournaments } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { createAdminAction, createTournamentAction, logoutAction } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { TournamentRow } from "./tournament-row";
import { AdminRow } from "./admin-row";
import { WipeAllButton } from "./wipe-all-button";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const admin = await requireAdmin();

  if (!admin.isSuper) {
    const assigned = (await listTournaments()).filter((t) => t.adminId === admin.id);
    if (assigned.length > 0) redirect(`/admin/${assigned[0].slug}`);
    return (
      <div className="rounded-lg border-dashed border border-slate-300 bg-white p-8 text-center text-sm text-slate-500 ">
        No tournaments are assigned to your account yet. Contact a super admin to get access.
      </div>
    );
  }

  const tournaments = await listTournaments();
  const admins = await listAdmins();
  const superCount = admins.filter((a) => a.isSuper).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Admin</h1>
        <form action={logoutAction}>
          <button
            type="submit"
            className="px-2.5 py-1.5 rounded-md text-sm text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            Logout
          </button>
        </form>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 ">Tournaments</h2>
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700 ">
            Create tournament
          </div>
          <ActionForm
            action={createTournamentAction}
            resetOnSuccess
            successMessage="Tournament created."
            className="grid-cols-1 gap-3 p-4 sm:grid-cols-2"
          >
            <div>
              <label htmlFor="name" className="block text-xs font-medium text-slate-600 mb-1">
                Name
              </label>
              <input
                id="name"
                name="name"
                required
                placeholder="e.g. Interdepartment Chess Tournament 2026"
                className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="type" className="block text-xs font-medium text-slate-600 mb-1">
                Type
              </label>
              <select
                id="type"
                name="type"
                className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="intradept">Intradepartment</option>
                <option value="interdept">Interdepartment</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="time_control" className="block text-xs font-medium text-slate-600 mb-1">
                Time control
              </label>
              <input
                id="time_control"
                name="time_control"
                defaultValue="10+5"
                className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="rounds_count" className="block text-xs font-medium text-slate-600 mb-1">
                Number of rounds
              </label>
              <input
                id="rounds_count"
                name="rounds_count"
                type="number"
                min={1}
                max={20}
                defaultValue={7}
                className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="default_rating" className="block text-xs font-medium text-slate-600 mb-1">
                Default rating for new players
              </label>
              <input
                id="default_rating"
                name="default_rating"
                type="number"
                defaultValue={1200}
                className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="admin_id" className="block text-xs font-medium text-slate-600 mb-1">
                Assigned admin
              </label>
              <select
                id="admin_id"
                name="admin_id"
                className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">None (assign later)</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.username}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="description" className="block text-xs font-medium text-slate-600 mb-1">
                Description (optional, shown on the listing and searchable)
              </label>
              <textarea
                id="description"
                name="description"
                rows={2}
                maxLength={300}
                placeholder="e.g. Annual interdepartment tournament, 7 rounds, 10+5"
                className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 cursor-pointer"
              >
                Create tournament
              </button>
            </div>
          </ActionForm>
        </div>

        {tournaments.length === 0 ? (
          <div className="rounded-lg border-dashed border border-slate-300 bg-white p-8 text-center text-sm text-slate-500 ">
            No tournaments yet.
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm divide-y divide-slate-100 ">
            {tournaments.map((t) => (
              <TournamentRow key={t.id} tournament={t} admins={admins} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 ">Admin accounts</h2>
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700 ">Create account</div>
          <ActionForm
            action={createAdminAction}
            resetOnSuccess
            successMessage="Account created."
            className="grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <div>
              <label htmlFor="username" className="block text-xs font-medium text-slate-600 mb-1">
                Username
              </label>
              <input
                id="username"
                name="username"
                required
                autoComplete="off"
                className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-slate-600 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={4}
                className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 pb-2 cursor-pointer">
              <input type="checkbox" name="is_super" value="1" className="accent-indigo-600" />
              Super admin
            </label>
            <div className="sm:col-span-3">
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 cursor-pointer"
              >
                Create account
              </button>
            </div>
          </ActionForm>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm divide-y divide-slate-100 ">
          {admins.map((a) => (
            <AdminRow key={a.id} admin={a} canDelete={a.id !== admin.id && !(a.isSuper && superCount <= 1)} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-600 ">Danger zone</h2>
        <div className="rounded-lg border border-rose-200 bg-white shadow-sm">
          <div className="border-b border-rose-100 px-4 py-2 text-sm font-medium text-rose-700 ">Wipe everything</div>
          <div className="space-y-3 p-4">
            <p className="text-xs text-slate-500 ">
              Deletes all tournaments (with their players, rounds, pairings and results) and all non-super admin
              accounts. Super admin accounts are kept. This cannot be undone.
            </p>
            <WipeAllButton />
          </div>
        </div>
      </section>
    </div>
  );
}

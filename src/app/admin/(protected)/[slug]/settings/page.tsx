import { notFound } from "next/navigation";
import { getTournamentBySlug } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth";
import { updateSettingsAction, changePasswordAction } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";

export const dynamic = "force-dynamic";

export default async function TournamentAdminSettingsPage({ params }: PageProps<"/admin/[slug]/settings">) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();
  await requireTournamentAccess(tournament.id);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700 ">Tournament</div>
        <ActionForm action={updateSettingsAction} successMessage="Settings saved." className="space-y-3 p-4">
          <input type="hidden" name="tournament_id" value={tournament.id} />
          <p className="text-xs text-slate-500 ">
            The name, type and assigned admin can only be changed by a super admin.
          </p>
          <div>
            <label htmlFor="time_control" className="block text-xs font-medium text-slate-600 mb-1">
              Time control
            </label>
            <input
              id="time_control"
              name="time_control"
              defaultValue={tournament.timeControl}
              placeholder="10+5"
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
              defaultValue={tournament.roundsCount}
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
              defaultValue={tournament.defaultRating}
              className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 cursor-pointer"
          >
            Save
          </button>
        </ActionForm>
      </section>

      <section className="rounded-lg border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700 ">
          Change admin password
        </div>
        <ActionForm
          action={changePasswordAction}
          successMessage="Password changed."
          resetOnSuccess
          className="space-y-3 p-4"
        >
          <div>
            <label htmlFor="current" className="block text-xs font-medium text-slate-600 mb-1">
              Current password
            </label>
            <input
              id="current"
              name="current"
              type="password"
              required
              className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="next" className="block text-xs font-medium text-slate-600 mb-1">
              New password
            </label>
            <input
              id="next"
              name="next"
              type="password"
              required
              minLength={4}
              className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-xs font-medium text-slate-600 mb-1">
              Confirm new password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={4}
              className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 cursor-pointer"
          >
            Change password
          </button>
        </ActionForm>
      </section>
    </div>
  );
}

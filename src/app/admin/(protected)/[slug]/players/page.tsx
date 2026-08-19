import { notFound } from "next/navigation";
import { getTournamentBySlug, listPlayers } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth";
import { addPlayerAction } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { PlayerRow } from "./player-row";

export const dynamic = "force-dynamic";

export default async function TournamentAdminPlayersPage({ params }: PageProps<"/admin/[slug]/players">) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();
  await requireTournamentAccess(tournament.id);

  const players = await listPlayers(tournament.id, true);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700 ">Add player</div>
        <ActionForm
          action={addPlayerAction}
          resetOnSuccess
          successMessage="Player added."
          className="grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_7rem_8rem_auto]"
        >
          <input type="hidden" name="tournament_id" value={tournament.id} />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="Full name"
              className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="rating">
              Rating
            </label>
            <input
              id="rating"
              name="rating"
              type="number"
              defaultValue={tournament.defaultRating}
              className="w-full rounded-md border-slate-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="rating_type">
              Rating type
            </label>
            <select
              id="rating_type"
              name="rating_type"
              className="w-full rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="manual">Manual</option>
              <option value="fide">FIDE</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 cursor-pointer"
            >
              Add
            </button>
          </div>
        </ActionForm>
      </section>

      <section className="rounded-lg border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700 ">
          Players <span className="text-xs font-normal text-slate-400 ">({players.length})</span>
        </div>
        {players.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500 ">No players yet.</div>
        ) : (
          <div className="divide-y divide-slate-100 ">
            {players.map((p) => (
              <PlayerRow key={p.id} player={p} tournamentId={tournament.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

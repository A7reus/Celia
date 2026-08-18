import Link from "next/link";
import { getSettings, listPlayers, listRounds, listPairings } from "@/lib/db";
import { generateRoundAction, resetTournamentAction } from "@/lib/actions";
import { roundStatusLabel } from "../../pairings/round-status";
import { GenerateButton } from "@/components/generate-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ActionForm } from "@/components/action-form";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const settings = await getSettings();
  const players = await listPlayers();
  const activePlayers = players.filter((p) => p.active === 1);
  const rounds = await listRounds();

  const pendingRound = rounds.find((r) => r.status === "draft" || r.status === "published");
  const completed = rounds.filter((r) => r.status === "completed").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active players" value={String(activePlayers.length)} />
        <Stat label="Rounds" value={`${completed} / ${settings.roundsCount}`} />
        <Stat label="Time control" value={settings.timeControl} />
        <Stat label="Next round" value={pendingRound ? `R${pendingRound.number} (${pendingRound.status})` : "N/A"} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700 ">Rounds</div>
        {rounds.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500 ">No rounds generated yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <tbody>
                {rounds.map(async (r) => {
                  const pairings = await listPairings(r.id);
                  const pendingResults = pairings.filter((p) => !p.isBye && p.result == null).length;
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pl-4 font-medium text-slate-800 ">Round {r.number}</td>
                      <td className="py-2.5 text-slate-500 ">{pairings.length} boards</td>
                      <td className="py-2.5 text-slate-500 ">
                        {r.status === "published" && pendingResults > 0 ? `${pendingResults} results pending` : ""}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roundStatusLabel(r.status)}`}>
                          {r.status}
                        </span>
                        <Link href={`/admin/rounds/${r.number}`} className="ml-3 text-indigo-600 hover:underline">
                          Manage
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!pendingRound && (
          <ActionForm action={generateRoundAction} className="border-t border-slate-100 px-4 py-3">
            <GenerateButton />
          </ActionForm>
        )}
      </section>

      {activePlayers.length < 2 && (
        <div className="rounded-lg border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 ">
          Add at least two active players before generating the first round.{" "}
          <Link href="/admin/players" className="font-medium underline">
            Manage players
          </Link>
        </div>
      )}

      {rounds.length > 0 && (
        <section className="rounded-lg border-rose-200 bg-white shadow-sm">
          <div className="border-b border-rose-100 px-4 py-2 text-sm font-medium text-rose-700 ">Danger zone</div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm text-slate-600 ">
              Start a fresh tournament: deletes all rounds, pairings and results. Players and settings are kept.
            </p>
            <form action={resetTournamentAction}>
              <ConfirmSubmitButton
                confirmText="Delete ALL rounds, pairings and results? Players and settings are kept. This cannot be undone."
                pendingLabel="Resetting..."
                className="rounded-md border-rose-300 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50 "
              >
                Reset tournament
              </ConfirmSubmitButton>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

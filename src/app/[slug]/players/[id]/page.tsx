import Link from "next/link";
import { notFound } from "next/navigation";
import { allGames, getPlayer, getTournamentBySlug, listPlayers } from "@/lib/db";
import { computeStandings } from "@/lib/scoring";
import { playerResultShort, playerResultCellClass, scoreFmt } from "@/components/results";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: PageProps<"/[slug]/players/[id]">) {
  const { slug, id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();

  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  const player = await getPlayer(tournament.id, id);
  if (!player) notFound();

  const players = await listPlayers(tournament.id);
  const games = await allGames(tournament.id);
  const standings = computeStandings(players, games);
  const standing = standings.find((s) => s.playerId === id);
  const rank = standings.findIndex((s) => s.playerId === id) + 1;

  return (
    <div className="space-y-4">
      <div className="flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">{player.name}</h1>
        <span className="text-xs text-slate-500 ">
          {rank > 0 ? `Rank ${rank} of ${standings.length}` : "Not in standings"} ·{" "}
          {player.ratingType === "fide" ? "FIDE rating" : "Rating"} {player.rating}
        </span>
      </div>

      {standing && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Points"
            value={scoreFmt(standing.score)}
            hint="Total score: 1 for a win, ½ for a draw, 0 for a loss. A bye counts as ½."
          />
          <Stat
            label="Performance (TPR)"
            value={standing.tpr != null ? String(standing.tpr) : "N/A"}
            hint="Tournament performance rating, estimated from the average opponent rating plus 400 x (wins - losses) / games played."
          />
          <Stat
            label="Record"
            value={`${standing.wins}-${standing.draws}-${standing.losses}`}
            hint="Wins-draws-losses. Byes count as draws."
          />
          <Stat
            label="Colors"
            value={`${standing.whiteCount}w / ${standing.blackCount}b`}
            hint="How many games were played as white and as black."
          />
        </div>
      )}

      {standing && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Buchholz"
            value={standing.buchholz.toFixed(1)}
            small
            hint="Sum of the final scores of all opponents, plus ½ per bye. Rewards playing stronger opposition."
          />
          <Stat
            label="Median Buchholz"
            value={standing.medianBuchholz.toFixed(1)}
            small
            hint="Buchholz minus the best and worst opponent scores. Less sensitive to extreme opponents."
          />
          <Stat
            label="Sonneborn-Berger"
            value={standing.sonnebornBerger.toFixed(1)}
            small
            hint="Sum of the scores of opponents you beat, plus half the scores of opponents you drew. A common tie-break."
          />
          <Stat
            label="Koya"
            value={standing.koya.toFixed(1)}
            small
            hint="Points scored against opponents who finished with at least 50%. Measures results against the top half of the field."
          />
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700 ">Games</div>
        {standing && standing.games.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <tbody>
                {standing.games.map((g) => (
                  <tr key={g.round} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pl-4 w-14 text-slate-400 ">R{g.round}</td>
                    <td className="py-2.5 w-8 text-slate-400 text-center">
                      {g.isBye ? "·" : g.color === "w" ? "W" : "B"}
                    </td>
                    <td className="py-2.5">
                      {g.isBye ? (
                        <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 ">
                          Bye
                        </span>
                      ) : (
                        <Link href={`/${tournament.slug}/players/${g.opponentId}`} className="hover:text-indigo-600">
                          {g.opponentName ?? "?"}
                        </Link>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      <span
                        className={`inline-block min-w-9 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${playerResultCellClass(g.result, g.color)}`}
                      >
                        {playerResultShort(g.result, g.color)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-sm text-slate-500 ">No games yet.</div>
        )}
      </div>

      <p className="text-xs text-slate-400 ">
        Time control: {tournament.timeControl} · {tournament.roundsCount} rounds Swiss system.
      </p>
    </div>
  );
}

function Stat({ label, value, small, hint }: { label: string; value: string; small?: boolean; hint?: string }) {
  return (
    <div className="rounded-lg border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div
        className={`${small ? "text-[10px]" : "text-[11px]"} text-slate-500 uppercase tracking-wide flex items-center gap-1`}
      >
        {label}
        {hint && (
          <span className="group relative inline-flex">
            <span className="h-3.5 w-3.5 inline-flex items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-500 cursor-help select-none">
              ?
            </span>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-52 -translate-x-1/2 rounded-md bg-slate-800 p-2 text-[11px] font-normal-case tracking-normal text-slate-100 shadow-lg group-hover:block">
              {hint}
            </span>
          </span>
        )}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

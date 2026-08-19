import { notFound } from "next/navigation";
import { allGames, getTournamentBySlug, listPlayers } from "@/lib/db";
import { computeStandings } from "@/lib/scoring";
import { StandingsTable } from "@/components/standings-table";

export const dynamic = "force-dynamic";

export default async function StandingsPage({ params }: PageProps<"/[slug]/standings">) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  const players = await listPlayers(tournament.id);
  const games = await allGames(tournament.id);
  const standings = players.length > 0 ? computeStandings(players, games) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold">Standings</h2>
        <span className="text-xs text-slate-500 ">{players.length} players</span>
      </div>
      {standings.length === 0 ? (
        <div className="rounded-lg border-dashed border border-slate-300 bg-white p-8 text-center text-sm text-slate-500 ">
          No players yet. The standings will appear here once the tournament starts.
        </div>
      ) : (
        <div className="rounded-lg border-slate-200 bg-white shadow-sm">
          <StandingsTable standings={standings} roundCount={tournament.roundsCount} slug={tournament.slug} />
        </div>
      )}
      <p className="text-xs text-slate-400 ">
        Tie-breaks: Buchholz · Median Buchholz · Sonneborn-Berger · Koya · most wins · rating. Performance rating (TPR)
        is based on the ratings entered for each player.
      </p>
    </div>
  );
}

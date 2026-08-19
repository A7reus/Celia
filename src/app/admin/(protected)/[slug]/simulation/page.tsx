import { notFound } from "next/navigation";
import { getTournamentBySlug } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth";
import { SimulateButton } from "./simulate-button";

export const dynamic = "force-dynamic";

export default async function TournamentAdminSimulationPage({ params }: PageProps<"/admin/[slug]/simulation">) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();
  await requireTournamentAccess(tournament.id);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Simulation (dry run)</h2>
      <SimulateButton tournamentId={tournament.id} slug={tournament.slug} />
    </div>
  );
}

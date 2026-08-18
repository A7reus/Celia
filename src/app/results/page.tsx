import Link from "next/link";
import { listRounds, listPairings, playerNameMap } from "@/lib/db";
import { PairingTable } from "@/components/pairing-table";
import { roundStatusLabel } from "../pairings/round-status";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const rounds = (await listRounds()).filter((r) => r.status !== "draft");
  const names = await playerNameMap();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Results</h1>
      {rounds.length === 0 ? (
        <div className="rounded-lg border-dashed border border-slate-300 bg-white p-8 text-center text-sm text-slate-500 ">
          No finished rounds yet.
        </div>
      ) : (
        rounds.map(async (round) => {
          const pairings = await listPairings(round.id);
          return (
            <div key={round.id} className="rounded-lg border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <span className="text-sm font-medium text-slate-700 ">Round {round.number}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roundStatusLabel(round.status)}`}>
                  {round.status === "published" ? "In progress" : "Finished"}
                </span>
              </div>
              <PairingTable pairings={pairings} names={names} />
            </div>
          );
        })
      )}
      <p className="text-xs text-slate-400 ">
        Looking for a specific round?{" "}
        <Link href="/pairings" className="text-indigo-600 hover:underline">
          Go to pairings
        </Link>
        .
      </p>
    </div>
  );
}

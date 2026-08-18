import { currentPublicRound, listPairings, playerNameMap, getSettings } from "@/lib/db";
import { PairingTable } from "@/components/pairing-table";
import { RoundNav } from "@/components/round-nav";
import { roundStatusLabel } from "./round-status";

export const dynamic = "force-dynamic";

export default async function PairingsPage() {
  const round = await currentPublicRound();
  const settings = await getSettings();
  const names = await playerNameMap();

  if (!round) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Pairings</h1>
        <div className="rounded-lg border-dashed border border-slate-300 bg-white p-8 text-center text-sm text-slate-500 ">
          Pairings will appear here once the tournament starts.
        </div>
      </div>
    );
  }

  const pairings = await listPairings(round.id);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold">
          Round {round.number} <span className="text-sm font-normal text-slate-500 ">pairings</span>
        </h1>
        <RoundNav current={round.number} total={settings.roundsCount} />
      </div>
      <div className="rounded-lg border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <span className="text-sm font-medium text-slate-700 ">Boards</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roundStatusLabel(round.status)}`}>
            {round.status === "published" ? "Live" : "Finished"}
          </span>
        </div>
        <PairingTable pairings={pairings} names={names} />
      </div>
      <p className="text-xs text-slate-400 ">White is listed first. Tap a name for a player&apos;s individual page.</p>
    </div>
  );
}

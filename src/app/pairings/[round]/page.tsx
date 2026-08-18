import { notFound } from "next/navigation";
import { getRoundByNumber, listPairings, playerNameMap, getSettings } from "@/lib/db";
import { PairingTable } from "@/components/pairing-table";
import { RoundNav } from "@/components/round-nav";
import { roundStatusLabel } from "../round-status";

export const dynamic = "force-dynamic";

export default async function RoundPage({ params }: PageProps<"/pairings/[round]">) {
  const { round: roundParam } = await params;
  const number = Number(roundParam);
  if (!Number.isInteger(number)) notFound();

  const round = await getRoundByNumber(number);
  if (!round) notFound();

  const settings = await getSettings();
  const names = await playerNameMap();

  if (round.status === "draft") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h1 className="text-xl font-semibold">
            Round {round.number} <span className="text-sm font-normal text-slate-500 ">pairings</span>
          </h1>
          <RoundNav current={round.number} total={settings.roundsCount} />
        </div>
        <div className="rounded-lg border-dashed border border-slate-300 bg-white p-8 text-center text-sm text-slate-500 ">
          Pairings for this round have not been published yet.
        </div>
      </div>
    );
  }

  const pairings = await listPairings(round.id);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold">
          Round {round.number} <span className="text-sm font-normal text-slate-500 ">results</span>
        </h1>
        <RoundNav current={round.number} total={settings.roundsCount} />
      </div>
      <div className="rounded-lg border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <span className="text-sm font-medium text-slate-700 ">Boards</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roundStatusLabel(round.status)}`}>
            {round.status === "published" ? "In progress" : "Finished"}
          </span>
        </div>
        <PairingTable pairings={pairings} names={names} />
      </div>
    </div>
  );
}

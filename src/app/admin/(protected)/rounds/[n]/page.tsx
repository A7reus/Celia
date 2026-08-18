import Link from "next/link";
import { notFound } from "next/navigation";
import { getRoundByNumber, listPairings, listPlayers, playerNameMap } from "@/lib/db";
import { PairingTable } from "@/components/pairing-table";
import {
  completeRoundAction,
  deleteRoundAction,
  generateRoundAction,
  publishRoundAction,
  regenerateRoundAction,
  reopenRoundAction
} from "@/lib/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ActionForm } from "@/components/action-form";
import { PairingEditor } from "./pairing-editor";
import { ResultsForm } from "./results-form";
import { roundStatusLabel } from "../../../../pairings/round-status";

export const dynamic = "force-dynamic";

export default async function AdminRoundPage({ params }: PageProps<"/admin/rounds/[n]">) {
  const { n: roundParam } = await params;
  const number = Number(roundParam);
  if (!Number.isInteger(number)) notFound();

  const round = await getRoundByNumber(number);
  if (!round) notFound();

  const pairings = await listPairings(round.id);
  const names = await playerNameMap();

  return (
    <div className="space-y-4">
      <div className="flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Round {round.number}{" "}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roundStatusLabel(round.status)}`}>
            {round.status}
          </span>
        </h2>
        <RoundActions round={round} />
      </div>

      {round.status === "draft" ? (
        <PairingEditor roundId={round.id} initialPairings={pairings} players={await listPlayers()} />
      ) : round.status === "published" ? (
        <ResultsForm roundId={round.id} pairings={pairings} names={names} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700 ">Final pairings</div>
          <PairingTable pairings={pairings} names={names} />
        </div>
      )}
    </div>
  );
}

async function RoundActions({ round }: { round: { id: number; number: number; status: string } }) {
  const nextNumber = round.number + 1;
  const nextRound = await getRoundByNumber(nextNumber);
  return (
    <div className="flex items-center gap-2 text-sm">
      {round.status === "draft" && (
        <>
          <ActionForm action={regenerateRoundAction}>
            <input type="hidden" name="round_id" value={round.id} />
            <button
              type="submit"
              className="rounded-md border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Regenerate
            </button>
          </ActionForm>
          <form action={publishRoundAction}>
            <input type="hidden" name="round_id" value={round.id} />
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700 cursor-pointer"
            >
              Publish round
            </button>
          </form>
        </>
      )}
      {round.status === "published" && (
        <ActionForm action={completeRoundAction}>
          <input type="hidden" name="round_id" value={round.id} />
          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700 cursor-pointer"
          >
            Complete round
          </button>
        </ActionForm>
      )}
      {round.status === "completed" && (
        <>
          <form action={reopenRoundAction}>
            <input type="hidden" name="round_id" value={round.id} />
            <button
              type="submit"
              className="rounded-md border-rose-300 px-3 py-1.5 text-rose-600 hover:bg-rose-50 cursor-pointer"
            >
              Reopen (fix results)
            </button>
          </form>
          {nextRound ? (
            <Link
              href={`/admin/rounds/${nextNumber}`}
              className="rounded-md border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50 "
            >
              Next round
            </Link>
          ) : (
            <ActionForm action={generateRoundAction}>
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700 cursor-pointer"
              >
                Pair next round
              </button>
            </ActionForm>
          )}
        </>
      )}
      <form action={deleteRoundAction}>
        <input type="hidden" name="round_id" value={round.id} />
        <ConfirmSubmitButton
          confirmText={`Delete round ${round.number}? All pairings and results in it will be lost.`}
          className="rounded-md border-rose-300 px-3 py-1.5 text-rose-600 hover:bg-rose-50 "
        >
          Delete round
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}

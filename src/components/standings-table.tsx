import Link from "next/link";
import type { StandingWithRank } from "@/types";
import { playerResultShort, playerResultCellClass, scoreFmt } from "./results";

export function StandingsTable({ standings, roundCount }: { standings: StandingWithRank[]; roundCount: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-left text-xs text-slate-500 border-b border-slate-200 ">
            <th className="py-2 pl-4 pr-2 w-8 font-medium">#</th>
            <th className="py-2 pr-2 font-medium">Player</th>
            <th className="py-2 pr-2 font-medium text-right">Rtg</th>
            <th className="py-2 pr-2 font-medium text-right">Pts</th>
            <th className="py-2 pr-2 font-medium text-right hidden md:table-cell" title="Buchholz">
              Buch
            </th>
            <th className="py-2 pr-2 font-medium text-right hidden lg:table-cell" title="Median Buchholz">
              MB
            </th>
            <th className="py-2 pr-2 font-medium text-right hidden lg:table-cell" title="Sonneborn-Berger">
              SB
            </th>
            <th className="py-2 pr-2 font-medium text-right hidden lg:table-cell" title="Koya">
              Koya
            </th>
            <th className="py-2 pr-2 font-medium text-right hidden sm:table-cell" title="Performance rating">
              TPR
            </th>
            {Array.from({ length: roundCount }, (_, i) => (
              <th
                key={i}
                className={`py-2 px-1 font-medium text-center text-[11px] ${i === roundCount - 1 ? "pr-4" : ""}`}
              >
                R{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => {
            const byRound = new Map(s.games.map((g) => [g.round, g]));
            return (
              <tr key={s.playerId} className="border-b border-slate-100 hover:bg-white ">
                <td className="py-2.5 pl-4 pr-2 text-slate-400 tabular-nums">{s.rank}</td>
                <td className="py-2.5 pr-2">
                  <Link href={`/players/${s.playerId}`} className="font-medium text-slate-800 hover:text-indigo-600">
                    {s.name}
                  </Link>
                </td>
                <td className="py-2.5 pr-2 text-right text-slate-600 tabular-nums">{s.rating}</td>
                <td className="py-2.5 pr-2 text-right font-semibold tabular-nums">{scoreFmt(s.score)}</td>
                <td className="py-2.5 pr-2 text-right text-slate-600 tabular-nums hidden md:table-cell">
                  {s.buchholz.toFixed(1)}
                </td>
                <td className="py-2.5 pr-2 text-right text-slate-600 tabular-nums hidden lg:table-cell">
                  {s.medianBuchholz.toFixed(1)}
                </td>
                <td className="py-2.5 pr-2 text-right text-slate-600 tabular-nums hidden lg:table-cell">
                  {s.sonnebornBerger.toFixed(1)}
                </td>
                <td className="py-2.5 pr-2 text-right text-slate-600 tabular-nums hidden lg:table-cell">
                  {s.koya.toFixed(1)}
                </td>
                <td className="py-2.5 pr-2 text-right text-slate-600 tabular-nums hidden sm:table-cell">
                  {s.tpr ?? "N/A"}
                </td>
                {Array.from({ length: roundCount }, (_, i) => {
                  const g = byRound.get(i + 1);
                  const cellPad = i === roundCount - 1 ? "pr-4" : "";
                  if (!g) return <td key={i} className={`py-2.5 px-1 ${cellPad}`} />;
                  return (
                    <td key={i} className={`py-2.5 px-1 ${cellPad}`}>
                      {g.isBye ? (
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-[11px] bg-sky-100 text-sky-700 "
                          title="Bye"
                        >
                          B
                        </span>
                      ) : (
                        <span
                          className={`inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-[11px] font-semibold tabular-nums ${playerResultCellClass(g.result, g.color)}`}
                          title={`${g.opponentName ?? "?"} (${g.color === "w" ? "white" : "black"})`}
                        >
                          {playerResultShort(g.result, g.color)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

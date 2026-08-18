import Link from "next/link";
import type { PairingRow } from "@/types";
import { resultText, resultCellClass } from "./results";

export function PairingTable({
  pairings,
  names,
  showResultColumn = true
}: {
  pairings: PairingRow[];
  names: Map<number, string>;
  showResultColumn?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[420px]">
        <tbody>
          {pairings.map((p) => {
            if (p.isBye) {
              const name = p.byeForId != null ? names.get(p.byeForId) : null;
              return (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 pl-4 w-10 text-slate-400 tabular-nums">{p.board}</td>
                  <td className="py-2.5 w-8 text-slate-400 " />
                  <td className="py-2.5 w-1/4 break-words">
                    {name ? (
                      <Link href={`/players/${p.byeForId}`} className="text-slate-700 hover:text-indigo-600">
                        {name}
                      </Link>
                    ) : (
                      <span className="text-slate-400 ">·</span>
                    )}
                  </td>
                  <td className="py-2.5 w-16 pr-4 text-right">
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 ">
                      bye
                    </span>
                  </td>
                </tr>
              );
            }
            const white = p.whiteId != null ? names.get(p.whiteId) : null;
            const black = p.blackId != null ? names.get(p.blackId) : null;
            return (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 pl-4 w-10 text-slate-400 tabular-nums">{p.board}</td>
                <td className="py-2.5 w-8 text-slate-400 text-center">W</td>
                <td className="py-2.5 w-1/4 break-words">
                  {white ? (
                    <Link href={`/players/${p.whiteId}`} className="font-medium text-slate-800 hover:text-indigo-600">
                      {white}
                    </Link>
                  ) : (
                    <span className="text-slate-400 ">·</span>
                  )}
                </td>
                <td className="py-2.5 w-16 px-2 text-center">
                  {showResultColumn ? (
                    <span
                      className={`inline-block min-w-9 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${resultCellClass(p.result)}`}
                    >
                      {resultText(p.result)}
                    </span>
                  ) : (
                    <span className="text-slate-300 ">vs</span>
                  )}
                </td>
                <td className="py-2.5 w-1/4 break-words text-right">
                  {black ? (
                    <Link href={`/players/${p.blackId}`} className="font-medium text-slate-800 hover:text-indigo-600">
                      {black}
                    </Link>
                  ) : (
                    <span className="text-slate-400 ">·</span>
                  )}
                </td>
                <td className="py-2.5 w-8 pr-4 text-slate-400 text-center">B</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

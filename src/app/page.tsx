import Link from "next/link";
import { completedRounds, listPlayers, listTournaments } from "@/lib/db";
import type { TournamentType } from "@/types";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<TournamentType, string> = {
  intradept: "Intradepartment",
  interdept: "Interdepartment",
  other: "Other"
};

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const tournaments = await listTournaments(query);
  const groups: { type: TournamentType; tournaments: typeof tournaments }[] = (
    ["intradept", "interdept", "other"] as TournamentType[]
  ).map((type) => ({ type, tournaments: tournaments.filter((t) => t.type === type) }));

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Tournaments</h1>
        <p className="text-xs text-slate-500 ">
          Archived tournaments stay viewable. Pairings, results and standings for each tournament are under its own
          page.
        </p>
      </div>

      <form method="GET" action="/" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search tournaments by name or description"
          className="min-w-56 flex-1 rounded-md border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 cursor-pointer"
        >
          Search
        </button>
        {query && (
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-700">
            Clear
          </Link>
        )}
      </form>

      {tournaments.length === 0 && (
        <div className="rounded-lg border-dashed border border-slate-300 bg-white p-8 text-center text-sm text-slate-500 ">
          {query
            ? "No tournaments match your search."
            : "No tournaments yet. A tournament will appear here once it is created."}
        </div>
      )}

      {groups.map((group) =>
        group.tournaments.length === 0 ? null : (
          <section key={group.type} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 ">{TYPE_LABELS[group.type]}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.tournaments.map(async (t) => {
                const players = (await listPlayers(t.id)).length;
                const completed = (await completedRounds(t.id)).length;
                return (
                  <Link
                    key={t.id}
                    href={`/${t.slug}/standings`}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:shadow"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-800 ">{t.name}</span>
                      <span className="flex items-center gap-1.5">
                        {t.status === "archived" && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 ">
                            Archived
                          </span>
                        )}
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ">
                          {TYPE_LABELS[t.type]}
                        </span>
                      </span>
                    </div>
                    {t.description && <p className="mt-2 text-xs text-slate-500 line-clamp-2 ">{t.description}</p>}
                    <p className="mt-2 text-xs text-slate-500 ">
                      {t.timeControl} · {t.roundsCount} rounds · {players} player{players === 1 ? "" : "s"} ·{" "}
                      {completed} round{completed === 1 ? "" : "s"} played
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        )
      )}
    </div>
  );
}

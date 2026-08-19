import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTournamentBySlug } from "@/lib/db";
import { TournamentTabs } from "@/components/tournament-tabs";
import type { TournamentType } from "@/types";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<TournamentType, string> = {
  intradept: "Intradepartment",
  interdept: "Interdepartment",
  other: "Other"
};

export async function generateMetadata({ params }: LayoutProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  return { title: tournament ? `${tournament.name} | Chess Tournaments` : "Chess Tournaments" };
}

export default async function TournamentLayout({ children, params }: LayoutProps<"/[slug]">) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{tournament.name}</h1>
        <p className="text-xs text-slate-500 ">
          {tournament.type === "intradept" || tournament.type === "interdept"
            ? `${TYPE_LABELS[tournament.type]} · `
            : ""}
          Time control: {tournament.timeControl} · {tournament.roundsCount} rounds
          {tournament.status === "archived" ? " · Archived" : ""}
        </p>
      </div>
      <TournamentTabs slug={tournament.slug} />
      {children}
    </div>
  );
}

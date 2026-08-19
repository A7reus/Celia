import Link from "next/link";
import { notFound } from "next/navigation";
import { getTournamentBySlug } from "@/lib/db";
import { currentAdmin, requireTournamentAccess } from "@/lib/auth";
import { logoutAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function TournamentAdminLayout({ children, params }: LayoutProps<"/admin/[slug]">) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();
  await requireTournamentAccess(tournament.id);
  const admin = await currentAdmin();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">{tournament.name}</h1>
          <span className="text-xs text-slate-500 ">
            Time control: {tournament.timeControl} · {tournament.roundsCount} rounds
            {tournament.status === "archived" ? " · Archived" : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <AdminLink href={`/admin/${tournament.slug}`}>Dashboard</AdminLink>
          <AdminLink href={`/admin/${tournament.slug}/players`}>Players</AdminLink>
          <AdminLink href={`/admin/${tournament.slug}/settings`}>Settings</AdminLink>
          <AdminLink href={`/admin/${tournament.slug}/simulation`}>Simulation</AdminLink>
          {admin?.isSuper && (
            <AdminLink href="/admin" subtle>
              All tournaments
            </AdminLink>
          )}
          <form action={logoutAction}>
            <button type="submit" className="px-2.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer">
              Logout
            </button>
          </form>
        </div>
      </div>
      {children}
    </div>
  );
}

function AdminLink({ href, children, subtle }: { href: string; children: React.ReactNode; subtle?: boolean }) {
  return (
    <Link
      href={href}
      className={`px-2.5 py-1.5 rounded-md font-medium ${
        subtle ? "text-slate-400 hover:text-slate-600 " : "text-slate-700 hover:bg-slate-100 "
      }`}
    >
      {children}
    </Link>
  );
}

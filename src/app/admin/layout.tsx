import Link from "next/link";
import { getSettings } from "@/lib/db";
import { logoutAction } from "@/lib/actions";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const settings = await getSettings();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          Admin <span className="text-sm font-normal text-slate-500 ">· {settings.tournamentName}</span>
        </h1>
        <div className="flex items-center gap-1 text-sm">
          <AdminLink href="/admin">Dashboard</AdminLink>
          <AdminLink href="/admin/players">Players</AdminLink>
          <AdminLink href="/admin/settings">Settings</AdminLink>
          <AdminLink href="/admin/simulation">Simulation</AdminLink>
          <Link href="/" className="px-2.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100 ">
            View site
          </Link>
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

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="px-2.5 py-1.5 rounded-md text-slate-700 hover:bg-slate-100 ">
      {children}
    </Link>
  );
}

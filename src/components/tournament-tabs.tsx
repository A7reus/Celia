"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TournamentTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/${slug}`;
  const tabs = [
    { href: `${base}/standings`, label: "Standings" },
    { href: `${base}/pairings`, label: "Pairings" },
    { href: `${base}/results`, label: "Results" }
  ];
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm border-b border-slate-200">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px px-3 py-2 border-b-2 font-medium ${
              active ? "border-indigo-600 text-indigo-700 " : "border-transparent text-slate-600 hover:text-slate-900 "
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

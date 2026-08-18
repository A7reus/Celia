import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { getSettings } from "@/lib/db";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "JUCSE Intradepartment Chess Tournament 2026",
  description: "JUCSE intradepartment chess tournament: pairings, results and standings"
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex-col bg-slate-50 text-slate-900">
        <SiteHeader />
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">{children}</main>
        <footer className="w-full border-t border-slate-200 bg-white">
          <div className="max-w-5xl mx-auto px-4 py-3 text-xs text-slate-500 flex flex-wrap justify-between gap-x-4 gap-y-1">
            <span>Rapid · 10+5</span>
            <span>Swiss system · 7 rounds</span>
            <a
              href="https://github.com/A7reus/JUCSE-Intradepartment-Chess-Tournament"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-700"
            >
              GitHub
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}

async function SiteHeader() {
  const settings = await getSettings();
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10 ">
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Link href="/" className="block font-semibold text-slate-900 truncate ">
            {settings.tournamentName}
          </Link>
          <span className="text-xs text-slate-500 hidden sm:block">
            Time control: {settings.timeControl} · {settings.roundsCount} rounds
          </span>
        </div>
        <nav className="flex items-center gap-1 text-sm shrink-0">
          <NavLink href="/">Standings</NavLink>
          <NavLink href="/pairings">Pairings</NavLink>
          <NavLink href="/results">Results</NavLink>
          <NavLink href="/admin" subtle>
            Admin
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children, subtle }: { href: string; children: React.ReactNode; subtle?: boolean }) {
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

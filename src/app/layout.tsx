import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "Chess Tournaments",
  description: "Swiss-system chess tournaments: pairings, results and standings"
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex-col bg-slate-50 text-slate-900">
        <SiteHeader />
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">{children}</main>
        <footer className="w-full border-t border-slate-200 bg-white">
          <div className="max-w-5xl mx-auto px-4 py-3 text-xs text-slate-500 flex flex-wrap justify-between gap-x-4 gap-y-1">
            <span>Swiss-system pairings, results and standings</span>
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

function SiteHeader() {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Link href="/" className="block font-semibold text-slate-900 truncate">
            Chess Tournaments
          </Link>
          <span className="text-xs text-slate-500 hidden sm:block">JUCSE tournaments hub</span>
        </div>
        <nav className="flex items-center gap-1 text-sm shrink-0">
          <NavLink href="/" subtle>
            Tournaments
          </NavLink>
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

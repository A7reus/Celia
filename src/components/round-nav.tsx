import Link from "next/link";

export function RoundNav({ slug, current, total }: { slug: string; current: number; total: number }) {
  const base = `/${slug}/pairings`;
  return (
    <div className="flex items-center gap-1 text-xs">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const active = n === current;
        return (
          <Link
            key={n}
            href={active ? base : `${base}/${n}`}
            className={`h-6 w-6 inline-flex items-center justify-center rounded ${
              active ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-200 "
            }`}
          >
            {n}
          </Link>
        );
      })}
    </div>
  );
}

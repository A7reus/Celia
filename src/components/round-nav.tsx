import Link from "next/link";

export function RoundNav({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const active = n === current;
        return (
          <Link
            key={n}
            href={active ? "/pairings" : `/pairings/${n}`}
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

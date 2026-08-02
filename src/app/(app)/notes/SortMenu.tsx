"use client";

import Link from "next/link";
import { useRef } from "react";

type SortOrder = "newest" | "oldest";

export default function SortMenu({
  sortOrder,
  newestHref,
  oldestHref,
}: {
  sortOrder: SortOrder;
  newestHref: string;
  oldestHref: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function closeMenu() {
    detailsRef.current?.removeAttribute("open");
  }

  return (
    <details ref={detailsRef} className="relative">
      <summary className="cursor-pointer list-none rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-slate-300 [&::-webkit-details-marker]:hidden">
        {sortOrder === "newest" ? "최신순" : "과거순"}⌄
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-32 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
        <Link
          href={newestHref}
          onClick={closeMenu}
          className={`block rounded-lg px-3 py-2 text-sm ${
            sortOrder === "newest"
              ? "bg-slate-900 font-bold text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          최신순
        </Link>
        <Link
          href={oldestHref}
          onClick={closeMenu}
          className={`block rounded-lg px-3 py-2 text-sm ${
            sortOrder === "oldest"
              ? "bg-slate-900 font-bold text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          과거순
        </Link>
      </div>
    </details>
  );
}

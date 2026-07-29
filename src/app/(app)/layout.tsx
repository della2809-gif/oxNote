import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";

const NAV_LINKS = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/notes", label: "오답노트" },
  { href: "/review", label: "복습" },
  { href: "/subjects", label: "과목" },
  { href: "/billing", label: "요금제" },
  { href: "/settings", label: "설정" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const isAdmin = user.app_metadata?.role === "admin";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neutral-950">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-5">
            <Link
              href="/dashboard"
              className="text-lg font-bold tracking-tight text-slate-950 dark:text-white"
            >
              xonote
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-slate-600 transition hover:text-slate-950 dark:text-neutral-400 dark:hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
              {isAdmin && (
                <Link
                  href="/admin"
                  className="font-semibold text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-400"
                >
                  운영자 콘솔
                </Link>
              )}
            </nav>
          </div>
          <form action={signOut} className="flex items-center gap-3">
            <span className="hidden max-w-[220px] truncate text-sm text-slate-500 sm:block">
              {user.email}
            </span>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}

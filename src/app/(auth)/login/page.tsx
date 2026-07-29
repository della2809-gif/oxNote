import Link from "next/link";
import { signIn } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const { error, message, next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  return (
    <form action={signIn} className="space-y-4 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
      <h1 className="text-lg font-semibold">로그인</h1>
      <input type="hidden" name="next" value={safeNext} />

      {error && (
        <div className="space-y-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          <p>{error}</p>
          {error.includes("이메일 인증") && (
            <Link href="/resend-confirmation" className="inline-block font-semibold underline">
              인증 메일 다시 받기
            </Link>
          )}
        </div>
      )}
      {message && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          {message}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">이메일</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="password" className="text-sm font-medium">비밀번호</label>
          <Link href="/forgot-password" className="text-xs text-neutral-600 underline dark:text-neutral-300">
            비밀번호 재설정
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
      >
        로그인
      </button>

      <p className="text-center text-sm text-neutral-500">
        계정이 없으신가요?{" "}
        <Link href={`/signup?next=${encodeURIComponent(safeNext)}`} className="font-medium text-neutral-900 underline dark:text-white">
          회원가입
        </Link>
      </p>
    </form>
  );
}

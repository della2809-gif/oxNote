import Link from "next/link";
import { signUp } from "../actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <form action={signUp} className="space-y-4 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
      <h1 className="text-lg font-semibold">회원가입</h1>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="displayName" className="text-sm font-medium">이름</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">이메일</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">비밀번호</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
      >
        가입하기
      </button>

      <p className="text-center text-sm text-neutral-500">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-medium text-neutral-900 underline dark:text-white">
          로그인
        </Link>
      </p>
    </form>
  );
}

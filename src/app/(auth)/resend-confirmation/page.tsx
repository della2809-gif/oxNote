import Link from "next/link";
import { resendSignupConfirmation } from "../actions";

export default async function ResendConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <form
      action={resendSignupConfirmation}
      className="space-y-4 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800"
    >
      <div>
        <h1 className="text-lg font-semibold">이메일 인증 다시 받기</h1>
        <p className="mt-1 text-sm text-neutral-500">
          가입한 이메일로 새 인증 링크를 보내드립니다.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
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

      <button
        type="submit"
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
      >
        인증 메일 다시 보내기
      </button>

      <p className="text-center text-sm text-neutral-500">
        <Link href="/login" className="font-medium text-neutral-900 underline dark:text-white">
          로그인으로 돌아가기
        </Link>
      </p>
    </form>
  );
}

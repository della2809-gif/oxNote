import Link from "next/link";
import { requestPasswordReset } from "../actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <form
      action={requestPasswordReset}
      className="space-y-4 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800"
    >
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">비밀번호 재설정</h1>
        <p className="text-sm text-neutral-500">
          가입한 이메일로 비밀번호 변경 링크를 보내드립니다.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          {message}
        </p>
      )}

      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <p className="font-semibold">재설정 메일은 한 번만 신청해 주세요.</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>메일 도착까지 최대 5분 정도 걸릴 수 있습니다.</li>
          <li>받은편지함과 스팸함을 확인해 주세요.</li>
          <li>연속 신청은 60초 이상 간격을 두어야 합니다.</li>
          <li>현재 기본 메일은 프로젝트 전체에서 시간당 2통까지만 발송됩니다.</li>
        </ul>
        <p className="mt-2 font-medium">
          한도를 초과한 경우 약 1시간 후 가장 최근 메일로 다시 진행해 주세요.
        </p>
      </div>

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
        재설정 메일 보내기
      </button>

      <p className="text-center text-sm text-neutral-500">
        <Link href="/login" className="font-medium text-neutral-900 underline dark:text-white">
          로그인으로 돌아가기
        </Link>
      </p>
    </form>
  );
}

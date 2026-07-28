import { updatePassword } from "../actions";

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <form
      action={updatePassword}
      className="space-y-4 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800"
    >
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">새 비밀번호 설정</h1>
        <p className="text-sm text-neutral-500">새로 사용할 비밀번호를 입력해 주세요.</p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">새 비밀번호</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="passwordConfirm" className="text-sm font-medium">새 비밀번호 확인</label>
        <input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
      >
        비밀번호 변경
      </button>
    </form>
  );
}
